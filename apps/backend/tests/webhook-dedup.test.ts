import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createHmac } from "node:crypto";
import type { Server } from "node:http";
import app from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { POLICY_VERSIONS } from "../src/lib/newsletter.js";

/**
 * Regression tests for the payment remediation (fulfill idempotency +
 * webhook event deduplication).
 *
 * The rig is fully synthetic (disposable database, throwaway users/orders).
 * No external payment provider is contacted: PayPal HTTP calls are mocked,
 * Stripe/crypto signatures are computed locally with the test-only secrets
 * pinned in tests/setup-env.ts.
 */
describe("payment remediation: fulfill idempotency + webhook event dedup", () => {
  let server: Server;
  let baseUrl: string;
  let roleId = "";

  function stripeSig(body: string): string {
    const t = Math.floor(Date.now() / 1000);
    const v1 = createHmac("sha256", "whsec_test").update(`${t}.${body}`).digest("hex");
    return `t=${t},v1=${v1}`;
  }

  function btcpaySig(body: string): string {
    return `sha256=${createHmac("sha256", "btcpay-webhook-secret").update(body).digest("hex")}`;
  }

  function bitpaySig(body: string): string {
    return createHmac("sha512", "bitpay-webhook-secret").update(body).digest("hex");
  }

  async function post(path: string, body: string, headers: Record<string, string>) {
    const res = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body,
    });
    const json = (await res.json().catch(() => null)) ?? {};
    return { status: res.status, body: json };
  }

  async function stripeEvent(orderId: string | null, eventId: string, type = "checkout.session.completed") {
    const body = JSON.stringify({
      id: eventId,
      type,
      data: {
        object: {
          id: `cs_${eventId}`,
          payment_status: "paid",
          metadata: { order_id: orderId },
        },
      },
    });
    return post("/api/payments/webhooks/stripe", body, { "stripe-signature": stripeSig(body) });
  }

  async function btcpayEvent(orderId: string | null, invoiceId: string, type: string) {
    const body = JSON.stringify({
      type,
      invoiceId,
      metadata: { orderId },
    });
    return post("/api/payments/webhooks/crypto/btcpayserver", body, { "btcpay-sig": btcpaySig(body) });
  }

  async function bitpayEvent(orderId: string | null, invoiceId: string, status: string, eventCode: string) {
    const body = JSON.stringify({
      event: { code: eventCode, name: eventCode },
      data: { id: invoiceId, status, orderId },
    });
    return post("/api/payments/webhooks/crypto/bitpay", body, { "x-bitpay-signature": bitpaySig(body) });
  }

  before(async () => {
    const role = await prisma.role.create({
      data: { name: "Webhook Dedup", slug: "webhook_dedup", permissions: [] },
    });
    roleId = role.id;
    server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    const addr = server.address() as { port: number };
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  after(() => {
    server.close();
  });

  async function makeFixture(tag: string, plan: "PRO" | "ENTERPRISE" = "PRO") {
    const username = `wh_dedup_${tag}_${Math.random().toString(36).slice(2, 8)}`;
    const user = await prisma.user.create({
      data: {
        username,
        email: `${username}@example.invalid`,
        passwordHash: "not-a-real-hash",
        acceptedPrivacyVersion: POLICY_VERSIONS.privacy,
        acceptedPoliciesAt: new Date(),
        emailVerified: true,
        emailVerifiedAt: new Date(),
        tier: "FREE",
        roleId,
      },
    });
    const order = await prisma.order.create({
      data: {
        userId: user.id,
        plan,
        currency: "USD",
        basePriceCents: 500,
        discountPercent: 0,
        finalPriceCents: 500,
      },
    });
    return { user, order };
  }

  const cleanupUsers: string[] = [];

  after(async () => {
    // Delete in reverse dependency order; orders/tips/purchases cascade via userId FK? They do not
    // (no onDelete: Cascade on these relations), so delete children explicitly.
    await prisma.processedWebhookEvent.deleteMany({ where: { key: { contains: "wh-dedup-test:" } } });
    for (const userId of cleanupUsers.splice(0).reverse()) {
      await prisma.order.deleteMany({ where: { userId } });
      await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
    }
    await prisma.role.deleteMany({ where: { slug: "webhook_dedup" } });
  });

  test("Stripe: duplicate delivery of the same event id is processed once", async () => {
    const { user, order } = await makeFixture("stripe_dup");
    cleanupUsers.push(user.id);

    const first = await stripeEvent(order.id, "wh-dedup-test:evt-stripe-dup");
    const second = await stripeEvent(order.id, "wh-dedup-test:evt-stripe-dup");

    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.deepEqual(second.body, { received: true });

    const fresh = await prisma.order.findUnique({ where: { id: order.id } });
    const freshUser = await prisma.user.findUnique({ where: { id: user.id } });
    assert.equal(fresh?.status, "PAID");
    assert.equal(freshUser?.tier, "PRO");
    assert.equal(
      await prisma.processedWebhookEvent.count({ where: { key: "stripe:wh-dedup-test:evt-stripe-dup" } }),
      1,
    );
  });

  test("Stripe: distinct event ids are both processed without double upgrade", async () => {
    const { user, order } = await makeFixture("stripe_two");
    cleanupUsers.push(user.id);

    const first = await stripeEvent(order.id, "wh-dedup-test:x-a");
    const second = await stripeEvent(order.id, "wh-dedup-test:x-b", "checkout.session.async_payment_succeeded");

    assert.equal(first.status, 200);
    assert.equal(second.status, 200);

    const freshUser = await prisma.user.findUnique({ where: { id: user.id } });
    assert.equal(freshUser?.tier, "PRO");
    assert.equal(
      await prisma.processedWebhookEvent.count({ where: { key: { startsWith: "stripe:wh-dedup-test:x-" } } }),
      2,
    );
  });

  test("PayPal: duplicate delivery calls capture once and fulfills once", async () => {
    const realFetch = globalThis.fetch;
    let captureCalls = 0;
    const paypalMock = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/v1/oauth2/token")) {
        return new Response(JSON.stringify({ access_token: "test-token" }), { status: 200 });
      }
      if (url.includes("/v1/notifications/verify-webhook-signature")) {
        return new Response(JSON.stringify({ verification_status: "SUCCESS" }), { status: 200 });
      }
      if (url.includes("/v2/checkout/orders/")) {
        captureCalls += 1;
        return new Response(
          JSON.stringify({ status: "COMPLETED", purchase_units: [{ payments: { captures: [{ id: "cap-dedup-1", status: "COMPLETED" }] } }] }),
          { status: 200 },
        );
      }
      // Not a PayPal URL: pass through (e.g. the test's own localhost webhook POST).
      return realFetch(input, init);
    }) as typeof fetch;
    globalThis.fetch = paypalMock;
    try {
      const { user, order } = await makeFixture("paypal_dup");
      cleanupUsers.push(user.id);

      const payload = JSON.stringify({
        id: "wh-dedup-test:evt-paypal-dup",
        event_type: "CHECKOUT.ORDER.APPROVED",
        resource: { id: "pp-order-1", custom_id: order.id },
      });
      const headers = {
        "paypal-auth-algo": "SHA256withRSA",
        "paypal-cert-url": "https://api.paypal.com/cert",
        "paypal-transmission-id": "tid",
        "paypal-transmission-sig": "sig",
        "paypal-transmission-time": new Date().toISOString(),
      };
      const first = await post("/api/payments/webhooks/paypal", payload, headers);
      const second = await post("/api/payments/webhooks/paypal", payload, headers);

      assert.equal(first.status, 200);
      assert.equal(second.status, 200);
      assert.equal(captureCalls, 1);

      const fresh = await prisma.order.findUnique({ where: { id: order.id } });
      assert.equal(fresh?.status, "PAID");
      assert.equal(fresh?.gatewayTransactionId, "cap-dedup-1");
      assert.equal(
        await prisma.processedWebhookEvent.count({ where: { key: "paypal:wh-dedup-test:evt-paypal-dup" } }),
        1,
      );
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  test("BTCPay: a neutral invoice event must not suppress the later settled event", async () => {
    const { user, order } = await makeFixture("btcpay_suppress");
    cleanupUsers.push(user.id);

    // Neutral/unmapped BTCPay event type for the same invoice: must NOT poison the
    // dedup key for the later InvoiceSettled.
    const neutral = await btcpayEvent(order.id, "wh-dedup-test:inv-sup", "InvoiceReceivedPayment");
    assert.equal(neutral.status, 200);

    const settled = await btcpayEvent(order.id, "wh-dedup-test:inv-sup", "InvoiceSettled");
    assert.equal(settled.status, 200);

    const fresh = await prisma.order.findUnique({ where: { id: order.id } });
    const freshUser = await prisma.user.findUnique({ where: { id: user.id } });
    assert.equal(fresh?.status, "PAID", "InvoiceSettled must still be processed after a neutral event");
    assert.equal(freshUser?.tier, "PRO");
  });

  test("BTCPay: redelivery of the same event type is deduplicated", async () => {
    const { user, order } = await makeFixture("btcpay_replay");
    cleanupUsers.push(user.id);

    const first = await btcpayEvent(order.id, "wh-dedup-test:inv-replay", "InvoiceSettled");
    const second = await btcpayEvent(order.id, "wh-dedup-test:inv-replay", "InvoiceSettled");

    assert.equal(first.status, 200);
    assert.equal(second.status, 200);

    const freshUser = await prisma.user.findUnique({ where: { id: user.id } });
    assert.equal(freshUser?.tier, "PRO");
    assert.equal(
      await prisma.processedWebhookEvent.count({
        where: { key: { contains: "wh-dedup-test:inv-replay" }, gateway: "crypto" },
      }),
      1,
    );
  });

  test("BitPay: a status change must not be suppressed by the earlier status event", async () => {
    const { user, order } = await makeFixture("bitpay_refund");
    cleanupUsers.push(user.id);

    const paid = await bitpayEvent(order.id, "wh-dedup-test:bip-1", "paid", "1002");
    assert.equal(paid.status, 200);

    const refunded = await bitpayEvent(order.id, "wh-dedup-test:bip-1", "refunded", "1006");
    assert.equal(refunded.status, 200);

    const fresh = await prisma.order.findUnique({ where: { id: order.id } });
    assert.equal(fresh?.status, "REFUNDED", "BitPay refund must be processed even though the same invoice was already seen");
  });

  test("fulfillOrderAsPaid: concurrent duplicate fulfillment upgrades exactly once", async () => {
    const { user, order } = await makeFixture("concurrent");
    cleanupUsers.push(user.id);

    const [a, b] = await Promise.all([
      fulfillOrder(order.id),
      fulfillOrder(order.id),
    ]);

    const upgrades = [a, b].filter((r) => r.upgraded).length;
    assert.equal(upgrades, 1, `exactly one concurrent call must upgrade (got ${upgrades})`);

    const fresh = await prisma.order.findUnique({ where: { id: order.id } });
    const freshUser = await prisma.user.findUnique({ where: { id: user.id } });
    assert.equal(fresh?.status, "PAID");
    assert.equal(freshUser?.tier, "PRO");

    async function fulfillOrder(orderId: string) {
      const { fulfillOrderAsPaid } = await import("../src/lib/payments/fulfill.js");
      return fulfillOrderAsPaid(orderId, { transactionId: "tx-concurrent", gatewayStatus: "paid" });
    }
  });

  test("failed fulfillment rolls back and webhook retry after transient failure succeeds", async () => {
    const { user, order } = await makeFixture("rollback");
    cleanupUsers.push(user.id);

    // Set a short lock_timeout for every new connection on the rig, then evict
    // pooled connections so the fulfilment transaction gets the new setting.
    await prisma.$executeRawUnsafe(`ALTER DATABASE current_database() SET lock_timeout = '2s'`.replace("current_database()", `"bioplatform_test"`));
    await prisma.$executeRawUnsafe(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'bioplatform_test' AND pid <> pg_backend_pid()`,
    );

    try {
      // Holder transaction: park a row lock on the user row for ~4s.
      const holder = prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SELECT id FROM users WHERE id = '${user.id}'::uuid FOR UPDATE`);
        await new Promise((r) => setTimeout(r, 4000));
      });

      const body = JSON.stringify({
        id: "wh-dedup-test:evt-rollback",
        type: "checkout.session.completed",
        data: { object: { id: "cs_rollback", payment_status: "paid", metadata: { order_id: order.id } } },
      });
      const sig = { "stripe-signature": stripeSig(body) };
      const failed = await post("/api/payments/webhooks/stripe", body, sig);

      assert.equal(failed.status, 500, "processing must fail while the user row is locked");
      assert.equal(
        await prisma.processedWebhookEvent.count({ where: { key: "stripe:wh-dedup-test:evt-rollback" } }),
        0,
        "a failed delivery must NOT be marked processed",
      );

      const afterFailure = await prisma.order.findUnique({ where: { id: order.id } });
      const userAfterFailure = await prisma.user.findUnique({ where: { id: user.id } });
      assert.equal(afterFailure?.status, "PENDING", "order update must roll back on failure");
      assert.equal(userAfterFailure?.tier, "FREE", "tier upgrade must roll back on failure");

      await holder.catch(() => undefined); // holder exits after ~4s
      await prisma.$executeRawUnsafe(
        `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'bioplatform_test' AND pid <> pg_backend_pid()`,
      );

      // Retry the identical event: must now succeed and be marked.
      const retry = await post("/api/payments/webhooks/stripe", body, sig);
      assert.equal(retry.status, 200);

      const fresh = await prisma.order.findUnique({ where: { id: order.id } });
      const freshUser = await prisma.user.findUnique({ where: { id: user.id } });
      assert.equal(fresh?.status, "PAID");
      assert.equal(freshUser?.tier, "PRO");
      assert.equal(
        await prisma.processedWebhookEvent.count({ where: { key: "stripe:wh-dedup-test:evt-rollback" } }),
        1,
      );
    } finally {
      await prisma
        .$executeRawUnsafe(`ALTER DATABASE "bioplatform_test" SET lock_timeout = '0'`)
        .catch(() => undefined);
      await prisma
        .$executeRawUnsafe(
          `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'bioplatform_test' AND pid <> pg_backend_pid()`,
        )
        .catch(() => undefined);
    }
  });
});
