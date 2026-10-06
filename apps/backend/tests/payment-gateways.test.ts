import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { prisma } from "../src/lib/prisma.js";
import { coinUsdRate, quoteCoinAmount, parseFallbackRates, clearRateCacheForTest } from "../src/lib/payments/rates.js";
import { BtcPayServerProvider, BitPayProvider, createCryptoInvoice } from "../src/lib/payments/crypto.js";
import { fulfillOrderAsPaid, markOrderCancelled, markOrderRefunded } from "../src/lib/payments/fulfill.js";
import { verifyStripeWebhook } from "../src/lib/payments/stripe.js";
import { paypalEventHandler, shouldCapturePayPalOrder, capturePayPalOrder } from "../src/lib/payments/paypal.js";
import { POLICY_VERSIONS } from "../src/lib/newsletter.js";

const realFetch = globalThis.fetch;

async function withFetchMock(impl: (url: string, init?: RequestInit) => Promise<Response>, fn: () => Promise<void>) {
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => impl(String(input), init);
  try {
    await fn();
  } finally {
    globalThis.fetch = realFetch;
  }
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}

describe("crypto rates", () => {
  before(() => clearRateCacheForTest());
  after(() => clearRateCacheForTest());

  test("parseFallbackRates parses Coin=USD pairs and ignores garbage", () => {
    assert.deepEqual(parseFallbackRates("BTC=90000,LTC=80,XMR=150"), { BTC: 90000, LTC: 80, XMR: 150 });
    assert.deepEqual(parseFallbackRates("BTC=0,=5,ABC=notanumber,,XMR=150 "), { XMR: 150 });
    assert.deepEqual(parseFallbackRates(""), {});
  });

  test("quoteCoinAmount converts USD cents to coin to 8 decimals", () => {
    assert.equal(quoteCoinAmount(500, 90000), "0.00005556");
    assert.equal(quoteCoinAmount(2900, 80), "0.36250000");
    assert.equal(quoteCoinAmount(100, 1), "1.00000000");
    assert.throws(() => quoteCoinAmount(100, 0));
  });

  test("coinUsdRate uses CoinGecko when reachable", async () => {
    clearRateCacheForTest();
    await withFetchMock(
      async (url) => {
        assert.match(url, /api\.coingecko\.com/);
        return jsonResponse({ bitcoin: { usd: 91000 } });
      },
      async () => {
        assert.equal(await coinUsdRate("BTC"), 91000);
      },
    );
  });

  test("coinUsdRate falls back to the env price when the API is unreachable", async () => {
    clearRateCacheForTest();
    await withFetchMock(
      async () => {
        throw new Error("network down");
      },
      async () => {
        assert.equal(await coinUsdRate("LTC"), 80);
      },
    );
  });

  test("coinUsdRate throws when no live rate and no fallback is configured", async () => {
    clearRateCacheForTest();
    await withFetchMock(
      async () => jsonResponse({}, 500),
      async () => {
        await assert.rejects(() => coinUsdRate("DOGE"), /No rate available for DOGE/);
      },
    );
  });
});

describe("crypto provider adapters", () => {
  test("BTCPay creates an invoice with the quoted coin amount and store", async () => {
    const provider = new BtcPayServerProvider();
    await withFetchMock(
      async (url, init) => {
        assert.equal(url, "https://btcpay.test/api/v1/stores/store_test/invoices");
        const headers = (init?.headers as Record<string, string>) ?? {};
        assert.equal(headers["Authorization"], "token btcpay-test-key");
        const body = JSON.parse(String(init?.body));
        assert.equal(body.amount, "0.00005556");
        assert.equal(body.currency, "BTC");
        assert.deepEqual(body.metadata, { orderId: "order-1" });
        return jsonResponse({ id: "inv-test", checkoutLink: "https://btcpay.test/i/inv-test" });
      },
      async () => {
        const res = await provider.createInvoice({ priceCents: 500, currency: "USD", coin: "BTC", coinAmount: "0.00005556", orderId: "order-1" });
        assert.equal(res.id, "inv-test");
        assert.equal(res.url, "https://btcpay.test/i/inv-test");
      },
    );
  });

  test("BitPay signs invoice requests with X-Signature (HMAC-SHA512)", async () => {
    const provider = new BitPayProvider();
    await withFetchMock(
      async (url, init) => {
        assert.equal(url, "https://bitpay.com/invoices");
        const headers = (init?.headers as Record<string, string>) ?? {};
        assert.equal(headers["X-Accept-Version"], "2.0.0");
        assert.equal(headers["X-Identity"], "bitpay-test-key");
        const expected = createHmac("sha512", "bitpay-test-key").update(String(init?.body)).digest("hex");
        assert.equal(headers["X-Signature"], expected);
        const body = JSON.parse(String(init?.body));
        assert.equal(body.price, "5.00");
        assert.equal(body.currency, "USD");
        assert.equal(body.orderId, "order-1");
        return jsonResponse({ data: { id: "bp-inv", url: "https://bitpay.com/invoice?id=bp-inv" } });
      },
      async () => {
        const res = await provider.createInvoice({ priceCents: 500, currency: "USD", orderId: "order-1" });
        assert.equal(res.id, "bp-inv");
        assert.equal(res.url, "https://bitpay.com/invoice?id=bp-inv");
      },
    );
  });

  test("BTCPay webhook signature + event mapping", () => {
    const provider = new BtcPayServerProvider();
    const payload = Buffer.from(JSON.stringify({ type: "InvoiceSettled", invoiceId: "inv-test", metadata: { orderId: "order-1" } }));
    const sig = `sha256=${createHmac("sha256", "btcpay-webhook-secret").update(payload).digest("hex")}`;
    const event = provider.verifyWebhook(payload, { "btcpay-sig": sig });
    assert.ok(event);
    assert.equal(provider.eventKind(event!), "paid");
    assert.equal(provider.orderIdOf(event!), "order-1");
    assert.equal(provider.verifyWebhook(payload, { "btcpay-sig": "sha256=deadbeef" }), null);
    assert.equal(provider.eventKind({ type: "InvoiceExpired" }), "cancelled");
    assert.equal(provider.eventKind({ type: "InvoiceRefund" }), "refunded");
    assert.equal(provider.eventKind({ type: "Unknown" }), null);
  });

  test("BitPay webhook signature + event mapping", () => {
    const provider = new BitPayProvider();
    const payload = Buffer.from(JSON.stringify({ data: { id: "bp-inv", orderId: "order-1", status: "complete" } }));
    const sig = createHmac("sha512", "bitpay-webhook-secret").update(payload).digest("hex");
    const event = provider.verifyWebhook(payload, { "x-bitpay-signature": sig });
    assert.ok(event);
    assert.equal(provider.eventKind(event!), "paid");
    assert.equal(provider.orderIdOf(event!), "order-1");
    assert.equal(provider.verifyWebhook(payload, { "x-bitpay-signature": "deadbeef" }), null);
    assert.equal(provider.eventKind({ data: { status: "expired" } }), "cancelled");
    assert.equal(provider.eventKind({ data: { status: "refunded" } }), "refunded");
    assert.equal(provider.eventKind({ data: { status: "new" } }), null);
  });

  test("createCryptoInvoice returns a quoted coin amount and delegates to the configured provider", async () => {
    await withFetchMock(
      async (url) => {
        assert.equal(url, "https://btcpay.test/api/v1/stores/store_test/invoices");
        return jsonResponse({ id: "inv-x", checkoutLink: "https://btcpay.test/i/inv-x" });
      },
      async () => {
        const invoice = await createCryptoInvoice({ plan: "PRO", priceCents: 500, currency: "USD", orderId: "order-2" });
        assert.equal(invoice.provider, "btcpayserver");
        assert.equal(invoice.coin, "BTC");
        assert.equal(invoice.url, "https://btcpay.test/i/inv-x");
        assert.ok(Number(invoice.coinAmount) > 0);
      },
    );
  });

  test("createCryptoInvoice honors a caller-selected supported coin", async () => {
    let createdBody: Record<string, unknown> | null = null;
    await withFetchMock(
      async (url, init) => {
        assert.equal(url, "https://btcpay.test/api/v1/stores/store_test/invoices");
        createdBody = JSON.parse(String(init?.body));
        return jsonResponse({ id: "inv-ltc", checkoutLink: "https://btcpay.test/i/inv-ltc" });
      },
      async () => {
        const invoice = await createCryptoInvoice({ plan: "PRO", priceCents: 500, currency: "USD", orderId: "order-3", coin: "LTC" });
        assert.equal(invoice.coin, "LTC");
        assert.equal(createdBody!.currency, "LTC");
        assert.ok(Number(invoice.coinAmount) > 0);
      },
    );
  });

  test("createCryptoInvoice falls back to the first supported coin for an unknown coin", async () => {
    await withFetchMock(
      async () => jsonResponse({ id: "inv-unk", checkoutLink: "https://btcpay.test/i/inv-unk" }),
      async () => {
        const invoice = await createCryptoInvoice({ plan: "PRO", priceCents: 500, currency: "USD", orderId: "order-4", coin: "DOGE" });
        assert.equal(invoice.coin, "BTC");
      },
    );
  });
});

describe("stripe webhook signature", () => {
  test("verifies and parses a valid payload, rejects tampering", () => {
    const secret = process.env.STRIPE_WEBHOOK_SECRET || "whsec_test";
    const timestamp = Math.floor(Date.now() / 1000);
    const payload = Buffer.from(JSON.stringify({ type: "checkout.session.completed", data: { object: { id: "cs_test", metadata: { order_id: "order-1" } } } }));
    const v1 = createHmac("sha256", secret).update(`${timestamp}.${payload.toString()}`).digest("hex");
    const event = verifyStripeWebhook(payload, `t=${timestamp},v1=${v1}`);
    assert.ok(event);
    assert.equal(event!.type, "checkout.session.completed");
    assert.ok(verifyStripeWebhook(payload, `t=${timestamp},v1=${"a".repeat(64)}`) === null);
    assert.ok(verifyStripeWebhook(payload, `t=${timestamp + 100000},v1=${v1}`) === null);
  });
});

describe("paypal event handling", () => {
  test("approving a PayPal order is NOT a cancellation (and triggers capture)", () => {
    assert.equal(paypalEventHandler("CHECKOUT.ORDER.APPROVED"), null, "approval alone must not cancel the order");
    assert.equal(shouldCapturePayPalOrder("CHECKOUT.ORDER.APPROVED"), true, "approval should trigger server-side capture");
    assert.equal(paypalEventHandler("PAYMENT.CAPTURE.COMPLETED"), "paid");
    assert.equal(paypalEventHandler("PAYMENT.CAPTURE.REFUNDED"), "refunded");
    assert.equal(paypalEventHandler("PAYMENT.CAPTURE.DENIED"), "cancelled");
    assert.equal(paypalEventHandler("PAYMENT.CAPTURE.REVERSED"), "cancelled");
    assert.equal(shouldCapturePayPalOrder("PAYMENT.CAPTURE.COMPLETED"), false);
  });

  test("capturePayPalOrder POSTs the capture endpoint and parses the completion state", async () => {
    await withFetchMock(
      async (url, init) => {
        if (url.endsWith("/v1/oauth2/token")) {
          return jsonResponse({ access_token: "tok-1", expires_in: 3600 });
        }
        assert.equal(url, "https://api-m.sandbox.paypal.com/v2/checkout/orders/PAY-123/capture");
        assert.equal(init?.method, "POST");
        return jsonResponse({
          status: "COMPLETED",
          purchase_units: [{ payments: { captures: [{ id: "CAP-1", status: "COMPLETED" }] } }],
        });
      },
      async () => {
        const res = await capturePayPalOrder("PAY-123");
        assert.equal(res.status, "COMPLETED");
        assert.equal(res.captureId, "CAP-1");
      },
    );
  });

  test("capturePayPalOrder surfaces a non-completed status", async () => {
    await withFetchMock(
      async (url) => {
        if (url.endsWith("/v1/oauth2/token")) return jsonResponse({ access_token: "tok-1", expires_in: 3600 });
        return jsonResponse({ status: "DECLINED" });
      },
      async () => {
        const res = await capturePayPalOrder("PAY-456");
        assert.equal(res.status, "DECLINED");
        assert.equal(res.captureId, undefined);
      },
    );
  });

  test("capturePayPalOrder rejects and does not capture when the gateway errors", async () => {
    await withFetchMock(
      async (url) => {
        if (url.endsWith("/v1/oauth2/token")) return jsonResponse({ access_token: "tok-1", expires_in: 3600 });
        return jsonResponse({ message: "order already captured" }, 400);
      },
      async () => {
        await assert.rejects(() => capturePayPalOrder("PAY-789"), /order already captured/);
      },
    );
  });
});

describe("order fulfillment (DB-backed)", () => {
  const userIds: string[] = [];
  const orderIds: string[] = [];

  async function mkUser(tier: "FREE" | "PRO" | "ENTERPRISE"): Promise<string> {
    const role = await prisma.role.upsert({
      where: { name: "fulfill_test" },
      update: {},
      create: { name: "fulfill_test", slug: "fulfill_test", permissions: [] },
    });
    const username = `fulfill_${Math.random().toString(36).slice(2, 8)}`;
    const u = await prisma.user.create({
      data: {acceptedTosVersion: POLICY_VERSIONS.tos, acceptedPrivacyVersion: POLICY_VERSIONS.privacy, acceptedPoliciesAt: new Date(),  username, email: `${username}@test.local`, passwordHash: "not-a-real-hash", roleId: role.id, tier },
    });
    userIds.push(u.id);
    return u.id;
  }

  after(async () => {
    await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.role.deleteMany({ where: { name: "fulfill_test" } });
  });

  async function mkOrder(userId: string, plan: "PRO" | "ENTERPRISE"): Promise<string> {
    const o = await prisma.order.create({
      data: { userId, plan, method: "CRYPTO", status: "PENDING", currency: "USD", basePriceCents: 500, discountPercent: 0, finalPriceCents: 500 },
    });
    orderIds.push(o.id);
    return o.id;
  }

  test("fulfillOrderAsPaid upgrades the buyer and is idempotent", async () => {
    const userId = await mkUser("FREE");
    const orderId = await mkOrder(userId, "PRO");
    const first = await fulfillOrderAsPaid(orderId, { transactionId: "inv-test", gatewayStatus: "paid" });
    assert.equal(first.upgraded, true);
    assert.equal(first.tier, "PRO");
    const after = await prisma.user.findUnique({ where: { id: userId }, select: { tier: true } });
    assert.equal(after!.tier, "PRO");
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    assert.equal(order!.status, "PAID");
    assert.equal(order!.gatewayStatus, "paid");

    const second = await fulfillOrderAsPaid(orderId, { transactionId: "again" });
    assert.equal(second.upgraded, false);
  });

  test("fulfillOrderAsPaid never downgrades a higher tier", async () => {
    const userId = await mkUser("ENTERPRISE");
    const o = await mkOrder(userId, "PRO");
    const res = await fulfillOrderAsPaid(o, {});
    assert.equal(res.upgraded, false);
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { tier: true } });
    assert.equal(user!.tier, "ENTERPRISE");
  });

  test("markOrderCancelled only affects PENDING orders; markOrderRefunded only PAID ones", async () => {
    const free = await mkUser("FREE");
    const pendingOrder = await mkOrder(free, "PRO");
    await markOrderCancelled(pendingOrder, { gatewayStatus: "expired" });
    const pending = await prisma.order.findUnique({ where: { id: pendingOrder } });
    assert.equal(pending!.status, "CANCELLED");

    const paidOrder = await mkOrder(free, "PRO");
    await fulfillOrderAsPaid(paidOrder, {});
    await markOrderRefunded(paidOrder, {});
    const paid = await prisma.order.findUnique({ where: { id: paidOrder } });
    assert.equal(paid!.status, "REFUNDED");
  });
});