import { getEnv } from "../../config/env.js";

let cachedToken: { token: string; expiresAt: number } | null = null;

function paypalBase(): string {
  return getEnv().PAYPAL_MODE === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
}

export function paypalEnabled(): boolean {
  const env = getEnv();
  return env.PAYPAL_ENABLED && Boolean(env.PAYPAL_CLIENT_ID && env.PAYPAL_CLIENT_SECRET && env.PAYPAL_WEBHOOK_ID);
}

async function paypalFetch(path: string, init: RequestInit): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${paypalBase()}${path}`, { ...init, signal: controller.signal });
    const json = (await res.json()) as Record<string, unknown>;
    if (!res.ok) throw new Error((json.message as string) ?? `PayPal ${res.status}`);
    return json;
  } finally {
    clearTimeout(timer);
  }
}

async function accessToken(): Promise<string> {
  const env = getEnv();
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) return cachedToken.token;
  const res = await paypalFetch("/v1/oauth2/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_CLIENT_SECRET}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const token = res.access_token;
  if (typeof token !== "string") throw new Error("PayPal token missing");
  const expiresIn = typeof res.expires_in === "number" ? res.expires_in : 3600;
  cachedToken = { token, expiresAt: Date.now() + expiresIn * 1000 };
  return token;
}

export async function createPayPalOrder(params: {
  orderId: string;
  currency: string;
  amountCents: number;
  successUrl?: string;
  cancelUrl?: string;
}): Promise<{ id: string; approveUrl: string }> {
  const token = await accessToken();
  const order = await paypalFetch("/v2/checkout/orders", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [
        {
          custom_id: params.orderId,
          amount: { currency_code: params.currency, value: (params.amountCents / 100).toFixed(2) },
        },
      ],
      application_context: {
        brand_name: getEnv().APP_NAME,
        user_action: "PAY_NOW",
        return_url: params.successUrl ?? `${getEnv().APP_URL}/dashboard?tab=billing&payment=success`,
        cancel_url: params.cancelUrl ?? `${getEnv().APP_URL}/dashboard?tab=billing&payment=cancelled`,
      },
    }),
  });
  const links = (order.links as Array<{ rel: string; href: string }>) ?? [];
  const approve = links.find((l) => l.rel === "approve");
  if (!approve) throw new Error("PayPal order has no approve link");
  return { id: String(order.id), approveUrl: approve.href };
}

export async function verifyPayPalWebhook(
  headers: Record<string, string | undefined>,
  body: unknown,
): Promise<boolean> {
  const env = getEnv();
  const authAlgo = headers["paypal-auth-algo"];
  const certUrl = headers["paypal-cert-url"];
  const transmissionId = headers["paypal-transmission-id"];
  const transmissionSig = headers["paypal-transmission-sig"];
  const transmissionTime = headers["paypal-transmission-time"];
  if (!authAlgo || !certUrl || !transmissionId || !transmissionSig || !transmissionTime) return false;
  const token = await accessToken();
  const res = await paypalFetch("/v1/notifications/verify-webhook-signature", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      auth_algo: authAlgo,
      cert_url: certUrl,
      transmission_id: transmissionId,
      transmission_sig: transmissionSig,
      transmission_time: transmissionTime,
      webhook_id: env.PAYPAL_WEBHOOK_ID,
      webhook_event: body,
    }),
  });
  return res.verification_status === "SUCCESS";
}

export function paypalEventHandler(eventType: string): "paid" | "refunded" | "cancelled" | null {
  if (eventType === "PAYMENT.CAPTURE.COMPLETED") return "paid";
  if (eventType === "PAYMENT.CAPTURE.REFUNDED" || eventType === "PAYMENT.CAPTURE.PARTIALLY_REFUNDED") return "refunded";
  if (eventType === "PAYMENT.CAPTURE.DENIED" || eventType === "PAYMENT.CAPTURE.REVERSED") {
    return "cancelled";
  }
  return null;
}

// The buyer approving a PayPal order is NOT a payment outcome. With intent
// CAPTURE the money only moves once the merchant captures server-side; until
// then the order must stay pending (the APPROVED event previously mapped to
// "cancelled", which destroyed legitimately approved orders before capture).
export function shouldCapturePayPalOrder(eventType: string): boolean {
  return eventType === "CHECKOUT.ORDER.APPROVED";
}

// Server-side capture for PayPal v2 Checkout (intent CAPTURE). Called after the
// payer approves; returns the capture status so the caller can fulfill or cancel.
export async function capturePayPalOrder(orderId: string): Promise<{ status: string; captureId?: string }> {
  const token = await accessToken();
  const res = await paypalFetch(`/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: "{}",
  });
  const status = String(res.status ?? "");
  const capture =
    (res.purchase_units as Array<{ payments?: { captures?: Array<{ id?: string; status?: string }> } }> | undefined)
      ?.find(() => true)
      ?.payments?.captures?.[0];
  return { status, captureId: typeof capture?.id === "string" ? capture.id : undefined };
}

export { accessToken as paypalAccessToken };