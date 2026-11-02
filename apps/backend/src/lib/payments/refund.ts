import { refundStripePayment, stripeEnabled, type StripeRefundResult } from "./stripe.js";
import { refundPayPalCapture, paypalEnabled, type PayPalRefundResult } from "./paypal.js";

/**
 * Outcome of a provider-side refund attempt, ordered by what the caller should
 * do next:
 *   - `refunded`: the gateway issued (or already issued) the refund — recording
 *     the local state is now safe.
 *   - `manual`: no automated refund path exists for this order. Crypto invoices
 *     keep the funds in the operator's own store wallet and MANUAL payments
 *     were never captured server-side, so returning the money is an
 *     off-platform, operator-performed movement (BTCPay / BitPay refund tool or
 *     the operator's wallet). Recording the local state stays allowed — the
 *     admin guide documents that the operator must return the money first.
 *   - `failed`: an automated attempt was REQUIRED (a card gateway is configured)
 *     and did not succeed. The caller must refuse the local transition so the
 *     books can never claim a refund the provider did not issue.
 */
export type ProviderRefundResult =
  | { state: "refunded" }
  | { state: "manual" }
  | { state: "failed"; message: string };

/**
 * Issues the provider-side refund for an order whose money was captured by the
 * named gateway. `transactionId` is the same value stored in
 * `gateway_transaction_id` at fulfilment time: the Stripe checkout session id
 * (`cs_…`) or the PayPal capture id. Crypto/manual methods never call out.
 */
export async function refundByGateway(
  method: "STRIPE" | "PAYPAL" | "CRYPTO" | "MANUAL",
  transactionId: string | null,
  amountCents: number,
  currency: string
): Promise<ProviderRefundResult> {
  if (method === "STRIPE" && stripeEnabled()) {
    if (!transactionId) {
      return { state: "failed", message: "no gateway transaction id is recorded for this order" };
    }
    return refundStripePayment(transactionId, amountCents);
  }
  if (method === "PAYPAL" && paypalEnabled()) {
    if (!transactionId) {
      return { state: "failed", message: "no gateway transaction id is recorded for this order" };
    }
    return refundPayPalCapture(transactionId, amountCents, currency);
  }
  // Either a crypto/manual method, or a card method whose gateway is currently
  // disabled: reflect the local state, money stays the operator's job.
  return { state: "manual" };
}

export type { StripeRefundResult, PayPalRefundResult };
