// Regression suite for the provider-side refund integration (owner-approved:
// Stripe + PayPal automated, crypto/manual stay operator-manual).
//
// Covers the refund primitives (`refundStripePayment`, `refundPayPalCapture`)
// and the `refundByGateway` dispatcher, plus the two admin entry points that
// move money BEFORE the local state is recorded:
//   - `PATCH /api/admin/orders/:id` → REFUNDED
//   - `POST /api/admin/invite-purchases/:id/refund`
//
// Stripe + PayPal endpoints are exercised through a mocked `globalThis.fetch`
// (patterns follow tests/webhook-dedup.test.ts). Mock URLs/ids are prefixed
// `ref_`/`CAPTURE-` so the routing stays unambiguous. No real network access
// and no real credentials: the test pins are scaffold values.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import type { Server } from "node:http";
import jwt from "jsonwebtoken";
import app from "../src/app.js";
import { getEnv, resetEnvForTests } from "../src/config/env.js";
import { prisma } from "../src/lib/prisma.js";
import { refundByGateway } from "../src/lib/payments/refund.js";
import { POLICY_VERSIONS } from "../src/lib/newsletter.js";

const ADMIN_ROLE_SLUG = "refund_admin";
const ADMIN_NAME = "refund-admin-user";
const BUYER_NAME = "refund-buyer-user";

type FetchCall = { url: string; method: string | undefined; body: string | undefined };

const calls: FetchCall[] = [];
const realFetch = globalThis.fetch;
let server: Server;
let baseUrl: string;
let adminRoleId: string;
let admin: { id: string };
let buyer: { id: string };

function fetchJson(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function signAuth(id: string): string {
  return jwt.sign({ userId: id, purpose: "auth" }, getEnv().JWT_SECRET, { expiresIn: "7d" });
}

async function request(path: string, init: RequestInit = {}) {
  const res = await fetch(`${baseUrl}${path}`, init);
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

async function cleanUp() {
  await prisma.order.deleteMany({ where: { user: { username: { in: [BUYER_NAME] } } } });
  await prisma.invitePurchaseOrder.deleteMany({ where: { id: { startsWith: "invites-ref-" } } });
  await prisma.user.deleteMany({ where: { username: { in: [ADMIN_NAME, BUYER_NAME] } } });
  await prisma.role.deleteMany({ where: { slug: ADMIN_ROLE_SLUG } });
}

function setGatewayPins(on: boolean) {
  if (on) {
    process.env.STRIPE_ENABLED = "true";
    process.env.STRIPE_SECRET_KEY = "sk_test_refunds";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
    process.env.PAYPAL_ENABLED = "true";
    process.env.PAYPAL_CLIENT_ID = "cid_test";
    process.env.PAYPAL_CLIENT_SECRET = "csecret_test";
    process.env.PAYPAL_WEBHOOK_ID = "whid_test";
    process.env.PAYPAL_MODE = "sandbox";
  } else {
    delete process.env.STRIPE_ENABLED;
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.PAYPAL_ENABLED;
    delete process.env.PAYPAL_CLIENT_ID;
    delete process.env.PAYPAL_CLIENT_SECRET;
    delete process.env.PAYPAL_WEBHOOK_ID;
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
  }
  resetEnvForTests();
}

before(async () => {
  calls.length = 0;
  setGatewayPins(true);

  globalThis.fetch = (async (input: URL | RequestInfo, init?: RequestInit) => {
    const url = String(input);
    const body = typeof init?.body === "string" ? init.body : undefined;
    // Only gateway traffic is recorded/asserted; everything else (the
    // integration cases below hit the app over loopback) passes straight
    // through to the real stack.
    const isGatewayCall = url.includes("stripe.com") || url.includes("/v2/payments/captures/") || url.includes("/v1/oauth2/token") || url.includes("/v1/refunds");
    if (isGatewayCall) calls.push({ url, method: init?.method, body });
    if (url.includes("/v1/oauth2/token")) {
      return fetchJson({ access_token: "PP-TEST-TOKEN", expires_in: 28800, scope: "x" });
    }
    if (url.includes("/v1/checkout/sessions/cs_ref_ok") && init?.method === "GET") {
      return fetchJson({ payment_intent: "pi_ref_ok" });
    }
    if (url.includes("/v1/checkout/sessions/cs_ref_fail")) {
      return fetchJson({ error: { message: "No such checkout session" } }, 404);
    }
    if (url.includes("/v1/refunds") && body?.includes("pi_ref_fail")) {
      return fetchJson({ error: { message: "Gateway exploded" } }, 500);
    }
    if (url.includes("/v1/refunds") && body?.includes("pi_ref_dup")) {
      return fetchJson(
        { error: { code: "charge_already_refunded", message: "Charge ch_ref_dup has already been refunded." } },
        400
      );
    }
    if (url.includes("/v1/refunds")) {
      return fetchJson({ id: "re_ref_1", status: "succeeded" });
    }
    if (url.includes("/captures/CAPTURE-FAIL/refund")) {
      return fetchJson({ message: "paypal exploded" }, 500);
    }
    if (url.includes("/captures/CAPTURE-DUP/refund")) {
      return fetchJson(
        { name: "INVALID_REQUEST", message: "Request failed", details: [{ issue: "TRANSACTION_ALREADY_REFUNDED" }] },
        400
      );
    }
    if (url.includes("/v2/payments/captures/")) {
      return fetchJson({ status: "COMPLETED" });
    }
    // Not a payment gateway: let the real stack answer (the admin-route
    // integration cases below hit the app over loopback).
    return realFetch(input as URL, init);
  }) as typeof fetch;

  await cleanUp();
  const role = await prisma.role.create({
    data: { name: "Refund Admin", slug: ADMIN_ROLE_SLUG, permissions: ["orders.manage", "invites.manage"] },
  });
  adminRoleId = role.id;
  const makeUser = (username: string) =>
    prisma.user.create({
      data: {
        username,
        email: `${username}@test.local`,
        passwordHash: "not-a-real-hash",
        roleId: adminRoleId,
        acceptedTosVersion: POLICY_VERSIONS.tos,
        acceptedPrivacyVersion: POLICY_VERSIONS.privacy,
        acceptedPoliciesAt: new Date(),
      },
    });
  admin = { id: (await makeUser(ADMIN_NAME)).id };
  buyer = { id: (await makeUser(BUYER_NAME)).id };

  const r = app.listen(0);
  await once(r, "listening");
  server = r;
  const addr = r.address();
  baseUrl = typeof addr === "object" && addr ? `http://127.0.0.1:${addr.port}` : "";
});

after(async () => {
  globalThis.fetch = realFetch;
  await cleanUp();
  server?.close();
});

// ---------------------------------------------------------------------------
// refundByGateway: unit level
// ---------------------------------------------------------------------------

test("Stripe: checkout-session id is resolved to the payment intent before refunding", async () => {
  const before = calls.length;
  const outcome = await refundByGateway("STRIPE", "cs_ref_ok", 1000, "USD");
  assert.equal(outcome.state, "refunded");
  const refundCall = calls[calls.length - 1];
  assert.equal(refundCall.method, "POST");
  assert.ok(refundCall.url.includes("/v1/refunds"));
  assert.equal(refundCall.body, "payment_intent=pi_ref_ok&amount=1000");
  assert.ok(calls.some((c) => c.url.includes("/v1/checkout/sessions/cs_ref_ok") && c.method === "GET"));
  assert.ok(calls.length > before);
});

test("Stripe: an already-refunded verdict counts as refunded (idempotent retry)", async () => {
  const outcome = await refundByGateway("STRIPE", "pi_ref_dup", 1000, "USD");
  assert.equal(outcome.state, "refunded");
  // No checkout-session resolution ran for a direct pi_ id.
  assert.ok(!calls.some((c) => c.url.includes("pi_ref_dup") && c.url.includes("/checkout/sessions")));
});

test("Stripe: a provider failure is surfaced as failed with the message", async () => {
  const outcome = await refundByGateway("STRIPE", "cs_ref_fail", 1000, "USD");
  assert.deepEqual(outcome, { state: "failed", message: "No such checkout session" });
});

test("PayPal: the capture is refunded with the order amount formatted as currency", async () => {
  const outcome = await refundByGateway("PAYPAL", "CAPTURE-OK", 1000, "USD");
  assert.equal(outcome.state, "refunded");
  const refundCall = calls[calls.length - 1];
  assert.ok(refundCall.url.includes("/v2/payments/captures/CAPTURE-OK/refund"));
  assert.equal(JSON.parse(refundCall.body!).amount.value, "10.00");
  assert.equal(JSON.parse(refundCall.body!).amount.currency, "USD");
  assert.ok(refundCall.body!.length <= JSON.stringify({ amount: { value: "10.00", currency: "USD" } }).length + 40);
});

test("PayPal: duplicate refund request counts as refunded", async () => {
  const outcome = await refundByGateway("PAYPAL", "CAPTURE-DUP", 1000, "USD");
  assert.equal(outcome.state, "refunded");
});

test("PayPal: provider failure surfaces as failed", async () => {
  const outcome = await refundByGateway("PAYPAL", "CAPTURE-FAIL", 1000, "USD");
  assert.deepEqual(outcome, { state: "failed", message: "paypal exploded" });
});

test("crypto and manual orders never call a payment API", async () => {
  const before = calls.length;
  const cryptoOutcome = await refundByGateway("CRYPTO", "whatever-id", 1000, "USD");
  const manualOutcome = await refundByGateway("MANUAL", null, 1000, "USD");
  assert.equal(cryptoOutcome.state, "manual");
  assert.equal(manualOutcome.state, "manual");
  assert.equal(calls.length, before);
});

test("a card order whose gateway is configured OFF stays manual (no API call)", async () => {
  setGatewayPins(false);
  try {
    const before = calls.length;
    const outcome = await refundByGateway("STRIPE", "cs_ref_ok", 1000, "USD");
    assert.equal(outcome.state, "manual");
    assert.equal(calls.length, before);
  } finally {
    setGatewayPins(true);
  }
});

test("a card order with the gateway on but no transaction id fails closed", async () => {
  const outcome = await refundByGateway("STRIPE", null, 1000, "USD");
  assert.deepEqual(outcome, { state: "failed", message: "no gateway transaction id is recorded for this order" });
});

// ---------------------------------------------------------------------------
// POST /api/admin/invite-purchases/:id/refund (money first)
// ---------------------------------------------------------------------------

async function seedInviteOrder(id: string, method: "STRIPE" | "PAYPAL", transactionId: string | null): Promise<void> {
  await prisma.invitePurchaseOrder.create({
    data: {
      id,
      userId: buyer.id,
      buyerEmail: `${BUYER_NAME}@test.local`,
      quantity: 1,
      priceCents: 500,
      currency: "USD",
      method,
      status: "PAID",
      gatewayTransactionId: transactionId,
      paidAt: new Date(),
    },
  });
}

test("invite purchase refund: PayPal money moves before the local REFUNDED write", async () => {
  await seedInviteOrder("invites-ref-ok", "PAYPAL", "CAPTURE-OK");
  const res = await request("/api/admin/invite-purchases/invites-ref-ok/refund", {
    method: "POST",
    headers: { Authorization: `Bearer ${signAuth(admin.id)}` },
  });
  assert.equal(res.status, 200);
  assert.equal(res.body?.data?.providerRefundPerformed, true);
  const order = await prisma.invitePurchaseOrder.findUniqueOrThrow({ where: { id: "invites-ref-ok" } });
  assert.equal(order.status, "REFUNDED");
  assert.ok(order.refundedAt);
});

test("invite purchase refund: a failing provider leaves the purchase PAID (502)", async () => {
  await seedInviteOrder("invites-ref-fail", "PAYPAL", "CAPTURE-FAIL");
  const res = await request("/api/admin/invite-purchases/invites-ref-fail/refund", {
    method: "POST",
    headers: { Authorization: `Bearer ${signAuth(admin.id)}` },
  });
  assert.equal(res.status, 502);
  const order = await prisma.invitePurchaseOrder.findUniqueOrThrow({ where: { id: "invites-ref-fail" } });
  assert.equal(order.status, "PAID");
  assert.equal(order.refundedAt, null);
});

// ---------------------------------------------------------------------------
// PATCH /api/admin/orders/:id (money first)
// ---------------------------------------------------------------------------

function seedOrder(method: "STRIPE" | "PAYPAL" | "CRYPTO" | "MANUAL", transactionId: string | null) {
  return prisma.order.create({
    data: {
      userId: buyer.id,
      plan: "PRO",
      status: "PAID",
      method,
      currency: "USD",
      basePriceCents: 1000,
      discountPercent: 0,
      finalPriceCents: 1000,
      gatewayTransactionId: transactionId,
      paidAt: new Date(),
    },
  });
}

async function patchRefunded(orderId: string) {
  return request(`/api/admin/orders/${orderId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${signAuth(admin.id)}` },
    body: JSON.stringify({ status: "REFUNDED" }),
  });
}

test("admin order refund: Stripe money moves before the local REFUNDED write", async () => {
  const order = await seedOrder("STRIPE", "cs_ref_ok");
  const res = await patchRefunded(order.id);
  assert.equal(res.status, 200);
  assert.equal(res.body?.providerRefundPerformed, true);
  // Order has no refundedAt column (regardless of method); the status transition
  // is the recorded fact and the provider receipt lives at the gateway.
  const fresh = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
  assert.equal(fresh.status, "REFUNDED");
});

test("admin order refund: a failing provider answers 502 and the order stays PAID", async () => {
  const order = await seedOrder("STRIPE", "cs_ref_fail");
  const res = await patchRefunded(order.id);
  assert.equal(res.status, 502);
  const fresh = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
  assert.equal(fresh.status, "PAID");
});

test("admin order refund: crypto order is marked refunded with no provider call", async () => {
  const order = await seedOrder("CRYPTO", "inv-something");
  const before = calls.length;
  const res = await patchRefunded(order.id);
  assert.equal(res.status, 200);
  assert.equal(res.body?.providerRefundPerformed, false);
  assert.equal(calls.length, before);
  const fresh = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
  assert.equal(fresh.status, "REFUNDED");
});

test("admin order refund: PayPal duplicate refund still completes the local transition", async () => {
  const order = await seedOrder("PAYPAL", "CAPTURE-DUP");
  const res = await patchRefunded(order.id);
  assert.equal(res.status, 200);
  assert.equal(res.body?.providerRefundPerformed, true);
  const fresh = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
  assert.equal(fresh.status, "REFUNDED");
});
