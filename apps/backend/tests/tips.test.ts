import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { updateProfileSchema, BTC_ADDRESS_RE, LTC_ADDRESS_RE } from "../src/lib/validation.js";
import { tipAmountSchema, tipUri, tipsPaymentMode } from "../src/lib/tips.js";
import { handleGatewayEvent } from "../src/lib/payments/handleGatewayEvent.js";
import { prisma } from "../src/lib/prisma.js";
import { POLICY_VERSIONS } from "../src/lib/newsletter.js";

describe("tip profile fields (Phase 4)", () => {
  test("accepts tipsEnabled, tipsHeading, tipsBtcAddress, tipsLtcAddress", () => {
    const result = updateProfileSchema.safeParse({
      tipsEnabled: true,
      tipsHeading: "Buy me a coffee",
      tipsBtcAddress: "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa",
      tipsLtcAddress: "ltc1qw508d6qejxtdg4y5r3zarvary0c5xw7kgmn4n9",
    });
    assert.ok(result.success, result.error?.issues[0]?.message ?? "");
    if (result.success) {
      assert.equal(result.data.tipsEnabled, true);
      assert.equal(result.data.tipsHeading, "Buy me a coffee");
      assert.equal(result.data.tipsBtcAddress, "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa");
      assert.equal(result.data.tipsLtcAddress, "ltc1qw508d6qejxtdg4y5r3zarvary0c5xw7kgmn4n9");
    }
  });

  test("accepts undefined tip fields (backward compatible)", () => {
    const result = updateProfileSchema.safeParse({});
    assert.ok(result.success);
  });

  test("accepts null tip fields (clears addresses)", () => {
    const result = updateProfileSchema.safeParse({
      tipsBtcAddress: null,
      tipsLtcAddress: null,
      tipsHeading: null,
    });
    assert.ok(result.success, result.error?.issues[0]?.message ?? "");
    if (result.success) {
      assert.equal(result.data.tipsBtcAddress, null);
      assert.equal(result.data.tipsLtcAddress, null);
      assert.equal(result.data.tipsHeading, null);
    }
  });

  test("rejects non-boolean tipsEnabled", () => {
    assert.ok(!updateProfileSchema.safeParse({ tipsEnabled: "yes" }).success);
    assert.ok(!updateProfileSchema.safeParse({ tipsEnabled: 1 }).success);
  });

  test("rejects an oversized tips heading (max 60)", () => {
    assert.ok(!updateProfileSchema.safeParse({ tipsHeading: "x".repeat(61) }).success);
  });

  test("sanitizes tips heading (strips HTML-like chars)", () => {
    const result = updateProfileSchema.safeParse({ tipsHeading: "<b>Say {hi}</b>" });
    assert.ok(result.success, result.error?.issues[0]?.message ?? "");
    if (result.success) {
      assert.equal(result.data.tipsHeading, "bSay hi/b");
    }
  });

  test("rejects an invalid Bitcoin address", () => {
    assert.ok(!updateProfileSchema.safeParse({ tipsBtcAddress: "not-an-address" }).success);
    assert.ok(!updateProfileSchema.safeParse({ tipsBtcAddress: "L" + "a".repeat(30) }).success); // LTC prefix
  });

  test("rejects an invalid Litecoin address", () => {
    assert.ok(!updateProfileSchema.safeParse({ tipsLtcAddress: "1" + "a".repeat(30) }).success); // BTC prefix
  });

  test("tip fields combine with other profile fields", () => {
    const result = updateProfileSchema.safeParse({
      displayName: "Test",
      tipsEnabled: true,
      tipsBtcAddress: "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa",
    });
    assert.ok(result.success, result.error?.issues[0]?.message ?? "");
    if (result.success) {
      assert.equal(result.data.displayName, "Test");
      assert.equal(result.data.tipsEnabled, true);
    }
  });
});

describe("tip address regex (Phase 4)", () => {
  test("BTC_ADDRESS_RE matches standard P2PKH (1...)", () => {
    assert.ok(BTC_ADDRESS_RE.test("1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa"));
  });

  test("BTC_ADDRESS_RE matches P2SH (3...)", () => {
    assert.ok(BTC_ADDRESS_RE.test("3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy"));
  });

  test("BTC_ADDRESS_RE matches bech32 (bc1...)", () => {
    assert.ok(BTC_ADDRESS_RE.test("bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kygt080"));
  });

  test("BTC_ADDRESS_RE rejects LTC prefixes (L/M)", () => {
    assert.ok(!BTC_ADDRESS_RE.test("LXgMh3RzgV5PoVqVeUoXKSPXZdMcjqkj6X"));
    assert.ok(!BTC_ADDRESS_RE.test("MQWxp9BxApm6YUQ9jB1g5GnYiT2j9f5t5v"));
  });

  test("LTC_ADDRESS_RE matches standard P2PKH (L.../M...)", () => {
    assert.ok(LTC_ADDRESS_RE.test("LXgMh3RzgV5PoVqVeUoXKSPXZdMcjqkj6X"));
    assert.ok(LTC_ADDRESS_RE.test("MQWxp9BxApm6YUQ9jB1g5GnYiT2j9f5t5v"));
  });

  test("LTC_ADDRESS_RE matches bech32 (ltc1...)", () => {
    assert.ok(LTC_ADDRESS_RE.test("ltc1qw508d6qejxtdg4y5r3zarvary0c5xw7kgmn4n9"));
  });

  test("LTC_ADDRESS_RE rejects standard BTC prefix (1...)", () => {
    assert.ok(!LTC_ADDRESS_RE.test("1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa"));
  });
});

describe("tip amount schema (Phase 4)", () => {
  test("accepts valid decimal amounts", () => {
    assert.ok(tipAmountSchema.safeParse("0.001").success);
    assert.ok(tipAmountSchema.safeParse("1").success);
    assert.ok(tipAmountSchema.safeParse("0.00000001").success);
    assert.ok(tipAmountSchema.safeParse("100000000").success);
    assert.ok(tipAmountSchema.safeParse("0.12345678").success);
  });

  test("rejects zero and negative amounts", () => {
    assert.ok(!tipAmountSchema.safeParse("0").success);
    assert.ok(!tipAmountSchema.safeParse("-0.001").success);
  });

  test("rejects amounts exceeding max", () => {
    assert.ok(!tipAmountSchema.safeParse("100000001").success);
  });

  test("rejects non-numeric strings", () => {
    assert.ok(!tipAmountSchema.safeParse("abc").success);
    assert.ok(!tipAmountSchema.safeParse("").success);
  });

  test("rejects more than 8 decimal places", () => {
    assert.ok(!tipAmountSchema.safeParse("0.123456789").success);
  });
});

describe("tipUri (Phase 4)", () => {
  test("builds a bitcoin: URI", () => {
    assert.equal(tipUri("BTC", "1ABC", "0.5"), "bitcoin:1ABC?amount=0.5");
  });

  test("builds a litecoin: URI", () => {
    assert.equal(tipUri("LTC", "ltc1xyz", "1.25"), "litecoin:ltc1xyz?amount=1.25");
  });
});

describe("tipsPaymentMode (Phase 4)", () => {
  test("returns 'btcpay' when a BTCPay provider is configured (test env)", () => {
    assert.equal(tipsPaymentMode(), "btcpay");
  });
});

describe("handleGatewayEvent tip branch (Phase 4)", () => {
  const tipIds: string[] = [];
  const userIds: string[] = [];
  let profileId = "";

  before(async () => {
    const role = await prisma.role.upsert({
      where: { name: "tips_test" },
      update: {},
      create: { name: "tips_test", slug: "tips_test", permissions: [] },
    });
    const username = `tips_${Math.random().toString(36).slice(2, 8)}`;
    const u = await prisma.user.create({
      data: {acceptedTosVersion: POLICY_VERSIONS.tos, acceptedPrivacyVersion: POLICY_VERSIONS.privacy, acceptedPoliciesAt: new Date(),  username, email: `${username}@test.local`, passwordHash: "not-a-real-hash", roleId: role.id, tier: "FREE" },
    });
    userIds.push(u.id);
    const p = await prisma.profile.create({ data: { userId: u.id, slug: `tips-${username}` } });
    profileId = p.id;
  });

  after(async () => {
    await prisma.tip.deleteMany({ where: { id: { in: tipIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.role.deleteMany({ where: { name: "tips_test" } });
  });

  async function mkTip(coin: string, amount: string, status?: "PENDING" | "CONFIRMED") {
    const tip = await prisma.tip.create({
      data: { profileId, coin, amount, ...(status === "CONFIRMED" ? { status, paidAt: new Date() } : status ? { status } : {}) },
    });
    tipIds.push(tip.id);
    return tip;
  }

  test("creates and then confirms a tip via tip- orderId", async () => {
    const tip = await mkTip("BTC", "0.01");
    await handleGatewayEvent(`tip-${tip.id}`, "paid");

    const updated = await prisma.tip.findUnique({ where: { id: tip.id }, select: { status: true, paidAt: true } });
    assert.equal(updated?.status, "CONFIRMED");
    assert.ok(updated?.paidAt instanceof Date);
  });

  test("cancels a pending tip on cancelled event", async () => {
    const tip = await mkTip("LTC", "0.5");
    await handleGatewayEvent(`tip-${tip.id}`, "cancelled");

    const updated = await prisma.tip.findUnique({ where: { id: tip.id }, select: { status: true } });
    assert.equal(updated?.status, "CANCELLED");
  });

  test("ignores events for already-confirmed tips", async () => {
    const tip = await mkTip("BTC", "1", "CONFIRMED");
    await handleGatewayEvent(`tip-${tip.id}`, "refunded");

    const updated = await prisma.tip.findUnique({ where: { id: tip.id }, select: { status: true } });
    assert.equal(updated?.status, "CONFIRMED");
  });

  test("ignores unknown tip- orderId gracefully", async () => {
    await handleGatewayEvent("tip-00000000-0000-0000-0000-000000000000", "paid");
  });
});
