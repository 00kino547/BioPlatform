import { createHmac, timingSafeEqual } from "node:crypto";
import { getEnv } from "../../config/env.js";

const API = "https://api.stripe.com";

export function stripeEnabled(): boolean {
  const env = getEnv();
  return env.STRIPE_ENABLED && Boolean(env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET);
}

async function stripeFetch(path: string, body: Record<string, string>): Promise<Record<string, unknown>> {
  const env = getEnv();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${API}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(body).toString(),
      signal: controller.signal,
    });
    const json = (await res.json()) as Record<string, unknown>;
    if (!res.ok) throw new Error((json.error as { message?: string })?.message ?? `Stripe ${res.status}`);
    return json;
  } finally {
    clearTimeout(timer);
  }
}

export async function createStripeCheckout(params: {
  orderId: string;
  planLabel: string;
  currency: string;
  amountCents: number;
  successUrl?: string;
  cancelUrl?: string;
}): Promise<{ sessionId: string; url: string }> {
  const session = await stripeFetch("/v1/checkout/sessions", {
    mode: "payment",
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": params.currency.toLowerCase(),
    "line_items[0][price_data][unit_amount]": String(params.amountCents),
    "line_items[0][price_data][product_data][name]": `BioPlatform ${params.planLabel}`,
    "line_items[0][price_data][product_data][metadata][order_id]": params.orderId,
    "metadata[order_id]": params.orderId,
    success_url: params.successUrl ?? `${getEnv().APP_URL}/dashboard?tab=billing&payment=success`,
    cancel_url: params.cancelUrl ?? `${getEnv().APP_URL}/dashboard?tab=billing&payment=cancelled`,
  });
  return { sessionId: String(session.id), url: String(session.url) };
}

export function verifyStripeWebhook(payload: Buffer, signature: string): { type: string; data: { object: Record<string, unknown> } } | null {
  const env = getEnv();
  const signed = signature.split(",");
  const t = signed.find((p) => p.startsWith("t="))?.slice(2);
  const v1 = signed.find((p) => p.startsWith("v1="))?.slice(3);
  if (!t || !v1) return null;
  const expected = createHmac("sha256", env.STRIPE_WEBHOOK_SECRET).update(`${t}.${payload.toString()}`).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(v1);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const freshness = 5 * 60 * 1000;
  if (Math.abs(Date.now() / 1000 - Number(t)) > freshness) return null;
  try {
    return JSON.parse(payload.toString()) as { type: string; data: { object: Record<string, unknown> } };
  } catch {
    return null;
  }
}

export const STRIPE_EVENT_ORDER_ID = (event: { data: { object: Record<string, unknown> } }): string | null => {
  const obj = event.data.object;
  const metadata = obj.metadata as Record<string, unknown> | undefined;
  const id = metadata?.order_id ?? metadata?.orderId;
  return typeof id === "string" && id ? id : null;
};

export async function refundStripePayment(transactionId: string): Promise<void> {
  await stripeFetch("/v1/refunds", { payment_intent: transactionId });
}