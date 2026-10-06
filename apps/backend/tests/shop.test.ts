import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { updateProfileSchema } from "../src/lib/validation.js";
import {
  getProductLimit,
  discountedCents,
  productFileKey,
  safeDownloadName,
  signDownloadToken,
  verifyDownloadToken,
  signClientToken,
  verifyClientToken,
} from "../src/lib/shop.js";
import { handleGatewayEvent } from "../src/lib/payments/handleGatewayEvent.js";
import { createProductSchema, updateProductSchema } from "../src/routes/shop.js";
import { prisma } from "../src/lib/prisma.js";
import { POLICY_VERSIONS } from "../src/lib/newsletter.js";

describe("shop profile promo field (Phase 5)", () => {
  test("accepts a discount percent (0-100), null to clear", () => {
    const ok = updateProfileSchema.safeParse({ shopDiscountPercent: 15 });
    assert.ok(ok.success, ok.error?.issues[0]?.message ?? "");
    if (ok.success) assert.equal(ok.data.shopDiscountPercent, 15);
    assert.ok(updateProfileSchema.safeParse({ shopDiscountPercent: 0 }).success);
    assert.ok(updateProfileSchema.safeParse({ shopDiscountPercent: 100 }).success);
    assert.ok(updateProfileSchema.safeParse({ shopDiscountPercent: null }).success);
  });

  test("rejects invalid discount values", () => {
    assert.ok(!updateProfileSchema.safeParse({ shopDiscountPercent: -1 }).success);
    assert.ok(!updateProfileSchema.safeParse({ shopDiscountPercent: 101 }).success);
    assert.ok(!updateProfileSchema.safeParse({ shopDiscountPercent: 12.5 }).success);
    assert.ok(!updateProfileSchema.safeParse({ shopDiscountPercent: "10" }).success);
  });
});

describe("shop tier limits (Phase 5)", () => {
  test("FREE is capped at 3 products", () => {
    assert.equal(getProductLimit("FREE"), 3);
  });

  test("PRO and ENTERPRISE are unlimited", () => {
    assert.equal(getProductLimit("PRO"), null);
    assert.equal(getProductLimit("ENTERPRISE"), null);
  });
});

describe("shop price math (Phase 5)", () => {
  test("discountedCents applies a percentage server-side", () => {
    assert.equal(discountedCents(1000, 10), 900);
    assert.equal(discountedCents(500, 0), 500);
    assert.equal(discountedCents(999, 33), 669);
    assert.equal(discountedCents(0, 50), 0);
  });

  test("discountedCents clamps out-of-range percentages", () => {
    assert.equal(discountedCents(1000, -20), 1000);
    assert.equal(discountedCents(1000, 150), 0);
  });
});

describe("shop file name helpers (Phase 5)", () => {
  test("productFileKey nests under the private products subtree", () => {
    assert.equal(productFileKey("abc.zip"), "products/abc.zip");
    assert.equal(productFileKey("folder/abc.zip"), "products/abc.zip");
  });

  test("safeDownloadName strips path separators and controls", () => {
    assert.equal(safeDownloadName('C:\\fakepath\\../evil "quote".pdf'), "C__fakepath_.._evil _quote_.pdf");
    assert.equal(safeDownloadName(".hidden"), "hidden");
    assert.equal(safeDownloadName(""), "download");
    assert.ok(safeDownloadName("x".repeat(300)).length <= 120);
  });
});

describe("shop signed tokens (Phase 5)", () => {
  test("download token round-trips", () => {
    const token = signDownloadToken("11111111-1111-1111-1111-111111111111");
    assert.equal(verifyDownloadToken(token), "11111111-1111-1111-1111-111111111111");
  });

  test("client token round-trips", () => {
    const token = signClientToken("11111111-1111-1111-1111-111111111111");
    assert.equal(verifyClientToken(token), "11111111-1111-1111-1111-111111111111");
  });

  test("tokens reject wrong purpose / garbage", () => {
    assert.equal(verifyDownloadToken(signClientToken("11111111-1111-1111-1111-111111111111")), null);
    assert.equal(verifyClientToken(signDownloadToken("11111111-1111-1111-1111-111111111111")), null);
    assert.equal(verifyDownloadToken("garbage"), null);
    assert.equal(verifyClientToken("garbage"), null);
  });
});

describe("shop product schemas (Phase B request products)", () => {
  test("createProductSchema coerces string priceCents from the SPA payload", () => {
    for (const raw of ["500", 500, "0", 0, "999"] as const) {
      const ok = createProductSchema.safeParse({ title: "Pack", priceCents: raw });
      assert.ok(ok.success, ok.error?.issues[0]?.message ?? "");
      if (ok.success) assert.equal(ok.data.priceCents, Number(raw));
    }
  });

  test("createProductSchema rejects non-integer, negative and over-max prices", () => {
    for (const bad of ["12.5", -1, "abc", 10_000_001]) {
      assert.ok(!createProductSchema.safeParse({ title: "Pack", priceCents: bad }).success);
    }
  });

  test("createProductSchema defaults to DOWNLOAD and accepts REQUEST", () => {
    assert.ok(createProductSchema.safeParse({ title: "Pack", priceCents: 0 }).success);
    const typed = createProductSchema.safeParse({ title: "Pack", priceCents: 0, type: "REQUEST" });
    assert.ok(typed.success);
    if (typed.success) assert.equal(typed.data.type, "REQUEST");
    assert.ok(!createProductSchema.safeParse({ title: "Pack", priceCents: 0, type: "FOO" }).success);
  });

  test("updateProductSchema coerces priceCents and accepts type", () => {
    const ok = updateProductSchema.safeParse({ priceCents: "1200", type: "REQUEST" });
    assert.ok(ok.success, ok.error?.issues[0]?.message ?? "");
    if (ok.success) {
      assert.equal(ok.data.priceCents, 1200);
      assert.equal(ok.data.type, "REQUEST");
    }
  });
});

describe("handleGatewayEvent request-product branch (Phase B)", () => {
  const purchaseIds: string[] = [];
  const userIds: string[] = [];
  const productIds: string[] = [];
  let profileId = "";

  before(async () => {
    const role = await prisma.role.upsert({
      where: { name: "shop_request_test" },
      update: {},
      create: { name: "shop_request_test", slug: "shop_request_test", permissions: [] },
    });
    const username = `shop_req_${Math.random().toString(36).slice(2, 8)}`;
    const u = await prisma.user.create({
      data: {acceptedTosVersion: POLICY_VERSIONS.tos, acceptedPrivacyVersion: POLICY_VERSIONS.privacy, acceptedPoliciesAt: new Date(),  username, email: `${username}@test.local`, passwordHash: "not-a-real-hash", roleId: role.id, tier: "FREE" },
    });
    userIds.push(u.id);
    const p = await prisma.profile.create({ data: { userId: u.id, slug: `shop-req-${username}` } });
    profileId = p.id;
  });

  after(async () => {
    await prisma.productPurchase.deleteMany({ where: { id: { in: purchaseIds } } });
    await prisma.product.deleteMany({ where: { id: { in: productIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.role.deleteMany({ where: { name: "shop_request_test" } });
  });

  test("keeps requestText on a paid request purchase and notifies the seller", async () => {
    const product = await prisma.product.create({
      data: {
        profileId,
        title: "Custom logo",
        priceCents: 5000,
        type: "REQUEST",
        fileName: "",
        filePath: "",
        fileSize: 0,
      },
    });
    productIds.push(product.id);
    const buyerEmail = "buyer-request@test.local";
    const purchase = await prisma.productPurchase.create({
      data: {
        productId: product.id,
        title: product.title,
        fileName: "",
        filePath: "",
        fileSize: 0,
        method: "STRIPE",
        status: "PENDING",
        basePriceCents: 5000,
        discountPercent: 0,
        finalPriceCents: 5000,
        buyerEmail,
        requestText: "A logo with a rocket <payload> astronaut",
      },
    });
    purchaseIds.push(purchase.id);

    await handleGatewayEvent(`purchase-${purchase.id}`, "paid", "tx-req-1");

    const updated = await prisma.productPurchase.findUnique({
      where: { id: purchase.id },
      select: { status: true, requestText: true, paidAt: true },
    });
    assert.equal(updated?.status, "PAID");
    assert.equal(updated?.requestText, "A logo with a rocket <payload> astronaut");
    assert.ok(updated?.paidAt instanceof Date);
  });

  test("requestText may be null for plain download purchases", async () => {
    const product = await prisma.product.create({
      data: {
        profileId,
        title: "Plain pack",
        priceCents: 1000,
        filePath: "/uploads/products/plain.zip",
        fileName: "plain.zip",
        fileSize: 100,
      },
    });
    productIds.push(product.id);
    const purchase = await prisma.productPurchase.create({
      data: {
        productId: product.id,
        title: product.title,
        fileName: product.fileName,
        filePath: product.filePath,
        fileSize: product.fileSize,
        method: "STRIPE",
        basePriceCents: 1000,
        discountPercent: 0,
        finalPriceCents: 1000,
        buyerEmail: "buyer-plain@test.local",
      },
    });
    purchaseIds.push(purchase.id);

    await handleGatewayEvent(`purchase-${purchase.id}`, "paid", "tx-plain-1");

    const updated = await prisma.productPurchase.findUnique({ where: { id: purchase.id }, select: { status: true } });
    assert.equal(updated?.status, "PAID");
  });
});

describe("handleGatewayEvent purchase branch (Phase 5)", () => {
  const purchaseIds: string[] = [];
  const userIds: string[] = [];
  const productIds: string[] = [];
  let profileId = "";

  before(async () => {
    const role = await prisma.role.upsert({
      where: { name: "shop_test" },
      update: {},
      create: { name: "shop_test", slug: "shop_test", permissions: [] },
    });
    const username = `shop_${Math.random().toString(36).slice(2, 8)}`;
    const u = await prisma.user.create({
      data: {acceptedTosVersion: POLICY_VERSIONS.tos, acceptedPrivacyVersion: POLICY_VERSIONS.privacy, acceptedPoliciesAt: new Date(),  username, email: `${username}@test.local`, passwordHash: "not-a-real-hash", roleId: role.id, tier: "FREE" },
    });
    userIds.push(u.id);
    const p = await prisma.profile.create({ data: { userId: u.id, slug: `shop-${username}` } });
    profileId = p.id;
  });

  after(async () => {
    await prisma.productPurchase.deleteMany({ where: { id: { in: purchaseIds } } });
    await prisma.product.deleteMany({ where: { id: { in: productIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.role.deleteMany({ where: { name: "shop_test" } });
  });

  async function mkPurchase(status?: "PENDING" | "PAID") {
    const product = await prisma.product.create({
      data: {
        profileId,
        title: "Test pack",
        priceCents: 1000,
        filePath: "/uploads/products/test.zip",
        fileName: "test.zip",
        fileSize: 100,
      },
    });
    productIds.push(product.id);
    const purchase = await prisma.productPurchase.create({
      data: {
        productId: product.id,
        title: product.title,
        fileName: product.fileName,
        filePath: product.filePath,
        fileSize: product.fileSize,
        method: "STRIPE",
        ...(status === "PAID" ? { status, paidAt: new Date() } : status ? { status } : {}),
        basePriceCents: 1000,
        discountPercent: 0,
        finalPriceCents: 1000,
      },
    });
    purchaseIds.push(purchase.id);
    return purchase;
  }

  test("marks a pending purchase PAID via purchase- orderId", async () => {
    const purchase = await mkPurchase();
    await handleGatewayEvent(`purchase-${purchase.id}`, "paid", "tx-1");

    const updated = await prisma.productPurchase.findUnique({
      where: { id: purchase.id },
      select: { status: true, paidAt: true, gatewayTransactionId: true },
    });
    assert.equal(updated?.status, "PAID");
    assert.ok(updated?.paidAt instanceof Date);
    assert.equal(updated?.gatewayTransactionId, "tx-1");
  });

  test("cancels a pending purchase on cancelled event", async () => {
    const purchase = await mkPurchase();
    await handleGatewayEvent(`purchase-${purchase.id}`, "cancelled");

    const updated = await prisma.productPurchase.findUnique({ where: { id: purchase.id }, select: { status: true } });
    assert.equal(updated?.status, "CANCELLED");
  });

  test("refunds a paid purchase", async () => {
    const purchase = await mkPurchase("PAID");
    await handleGatewayEvent(`purchase-${purchase.id}`, "refunded", "ref-1");

    const updated = await prisma.productPurchase.findUnique({
      where: { id: purchase.id },
      select: { status: true, refundedAt: true, gatewayTransactionId: true },
    });
    assert.equal(updated?.status, "REFUNDED");
    assert.ok(updated?.refundedAt instanceof Date);
  });

  test("ignores events for already-paid purchases", async () => {
    const purchase = await mkPurchase("PAID");
    await handleGatewayEvent(`purchase-${purchase.id}`, "cancelled");

    const updated = await prisma.productPurchase.findUnique({ where: { id: purchase.id }, select: { status: true } });
    assert.equal(updated?.status, "PAID");
  });

  test("ignores unknown purchase- orderId gracefully", async () => {
    await handleGatewayEvent("purchase-00000000-0000-0000-0000-000000000000", "paid");
  });
});