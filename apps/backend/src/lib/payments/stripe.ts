import { createHmac, timingSafeEqual } from "node:crypto";
import { getEnv } from "../../config/env.js";

const API = "https://api.stripe.com";

export function stripeEnabled(): boolean {
  const env = getEnv();
  return env.STRIPE_ENABLED && Boolean(env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET);
}

type StripeResponse = { status: number; ok: boolean; json: Record<string, unknown> };

async function stripeCall(path: string, init: { method: "GET" | "POST"; body?: Record<string, string> }): Promise<StripeResponse> {
  const env = getEnv();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${API}${path}`, {
      method: init.method,
      headers: {
        Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
        ...(init.body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
      },
      body: init.body ? new URLSearchParams(init.body).toString() : undefined,
      signal: controller.signal,
    });
    // Refund responses carry error bodies that must distinguish
    // `charge_already_refunded` from other failures, so never throw away a
    // parseable body — surface it to the caller instead.
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { status: res.status, ok: res.ok, json };
  } finally {
    clearTimeout(timer);
  }
}

async function stripeFetch(path: string, body: Record<string, string>): Promise<Record<string, unknown>> {
  const { ok, status, json } = await stripeCall(path, { method: "POST", body });
  if (!ok) throw new Error((json.error as { message?: string })?.message ?? `Stripe ${status}`);
  return json;
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
  // `t` is an epoch-SECONDS timestamp, so the tolerance must be in seconds too.
  // A millisecond-scale constant here silently widens the replay window to ~3.5
  // days instead of the intended 5 minutes.
  const freshnessSeconds = 5 * 60;
  if (Math.abs(Date.now() / 1000 - Number(t)) > freshnessSeconds) return null;
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

export type StripeRefundResult = { state: "refunded" } | { state: "failed"; message: string };

/**
 * Issues a full refund for the payment behind `transactionId` — the value stored
 * in `orders.gateway_transaction_id`. For card orders that value is the CHECKOUT
 * SESSION id (`cs_…`), so the payment intent behind it is resolved with a
 * session read first; rows that already hold a `ch_`/`pi_` id use it directly.
 * A refund issued against a session is scoped to the order's amount so an
 * accidental second call can never refund more than the order captured. Stripe
 * reporting the charge as already refunded is surfaced as `refunded`, which
 * keeps a retry after a partial failure idempotent.
 */
export async function refundStripePayment(transactionId: string, amountCents: number): Promise<StripeRefundResult> {
  let refundParams: Record<string, string>;
  if (transactionId.startsWith("cs_")) {
    const session = await stripeCall(`/v1/checkout/sessions/${encodeURIComponent(transactionId)}`, { method: "GET" });
    if (!session.ok) {
      const err = session.json.error as { message?: string } | undefined;
      return { state: "failed", message: err?.message ?? `Stripe ${session.status}` };
    }
    const paymentIntent =
      typeof session.json.payment_intent === "string" && session.json.payment_intent.length > 0
        ? session.json.payment_intent
        : null;
    if (!paymentIntent) {
      return { state: "failed", message: "Checkout session has no completed payment to refund" };
    }
    refundParams = { payment_intent: paymentIntent };
  } else if (transactionId.startsWith("ch_")) {
    refundParams = { charge: transactionId };
  } else {
    refundParams = { payment_intent: transactionId };
  }
  refundParams.amount = String(amountCents);
  const res = await stripeCall("/v1/refunds", { method: "POST", body: refundParams });
  if (res.ok) return { state: "refunded" };
  const err = res.json.error as { code?: string; message?: string } | undefined;
  if (err?.code === "charge_already_refunded") return { state: "refunded" };
  return { state: "failed", message: err?.message ?? `Stripe ${res.status}` };
}