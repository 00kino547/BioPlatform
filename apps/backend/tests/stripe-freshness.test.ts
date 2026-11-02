// Regression tests for the Stripe webhook `t` (timestamp) freshness check.
//
// The original defect: the tolerance constant was written in milliseconds
// (5 * 60 * 1000) but compared against epoch SECONDS, so the effective replay
// window was ~3.5 days instead of the intended 5 minutes. These tests sign
// payloads exactly the way Stripe does (`t=` timestamp, `v1=` HMAC-SHA256 over
// `${t}.${payload}`) and prove that the tolerance is now applied in seconds.
//
// `tests/setup-env.ts` pins STRIPE_WEBHOOK_SECRET=whsec_test.
import { createHmac } from "node:crypto";
import { test } from "node:test";
import assert from "node:assert/strict";
import { verifyStripeWebhook } from "../src/lib/payments/stripe.js";

const SECRET = process.env.STRIPE_WEBHOOK_SECRET!;

function signedPayload(event: Record<string, unknown>, timestampSeconds: number): { payload: Buffer; signature: string } {
  const payload = Buffer.from(JSON.stringify(event));
  const mac = createHmac("sha256", SECRET).update(`${timestampSeconds}.${payload.toString()}`).digest("hex");
  return { payload, signature: `t=${timestampSeconds},v1=${mac}` };
}

const event = {
  id: "evt_stripe_freshness",
  type: "checkout.session.completed",
  data: { object: { id: "cs_test_freshness" } },
};

test("Stripe webhook with a fresh timestamp (30s old) is verified", () => {
  const { payload, signature } = signedPayload(event, Math.floor(Date.now() / 1000) - 30);
  const parsed = verifyStripeWebhook(payload, signature);
  assert.ok(parsed);
  assert.equal(parsed.type, "checkout.session.completed");
});

test("Stripe webhook just inside the 5-minute tolerance (4m59s old) is verified", () => {
  const { payload, signature } = signedPayload(event, Math.floor(Date.now() / 1000) - (5 * 60 - 1));
  const parsed = verifyStripeWebhook(payload, signature);
  assert.ok(parsed);
});

test("Stripe webhook just outside the tolerance (6 minutes old) is rejected", () => {
  // With the millisecond bug this signature verified even ~860x later.
  const { payload, signature } = signedPayload(event, Math.floor(Date.now() / 1000) - (6 * 60));
  assert.equal(verifyStripeWebhook(payload, signature), null);
});

test("Stripe webhook with a far-future timestamp is rejected", () => {
  const { payload, signature } = signedPayload(event, Math.floor(Date.now() / 1000) + 6 * 60);
  assert.equal(verifyStripeWebhook(payload, signature), null);
});

test("Stripe webhook with a ~3.5-day-old timestamp is rejected", () => {
  // The exact window the ms/seconds mismatch opened: 300000 seconds old.
  const { payload, signature } = signedPayload(event, Math.floor(Date.now() / 1000) - 300000);
  assert.equal(verifyStripeWebhook(payload, signature), null);
});
