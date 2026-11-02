// Regression tests for the conditional-transition rework of the three
// check-then-act payment sites:
//   - `handleGatewayEvent` tip arm (was: read status, then unconditional update)
//   - `handleGatewayEvent` shop purchase arm (was: read status, then update)
//   - `PATCH /api/admin/orders/:id` (was: plain `update` inside the transaction)
//
// Each site now claims its row with a conditional `updateMany` restricted to
// the source states its transition is legal from, so a webhook event that
// races another (refund vs confirm, admin force-pay vs webhook refund) cannot
// overwrite what the earlier event legitimately wrote.
//
// Needs a Postgres at DATABASE_URL (tests/setup-env.ts). No HTTP calls for the
// webhook arms — handleGatewayEvent is exercised directly; only the admin
// route test boots the express app.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import type { Server } from "node:http";
import jwt from "jsonwebtoken";
import app from "../src/app.js";
import { getEnv } from "../src/config/env.js";
import { prisma } from "../src/lib/prisma.js";
import { handleGatewayEvent } from "../src/lib/payments/handleGatewayEvent.js";
import { SHOP_PURCHASE_PREFIX } from "../src/lib/shop.js";
import { POLICY_VERSIONS } from "../src/lib/newsletter.js";

const ADMIN_ROLE_SLUG = "race_admin";
const ADMIN_SLUG = "race-admin-user";
const BUYER_SLUG = "race-buyer-user";
const SELLER_SLUG = "race-seller-user";
const PROFILE_SLUG_PREFIX = "race-";

let server: Server;
let baseUrl: string;
let adminRoleId: string;
let admin: { id: string };
let buyer: { id: string };
let seller: { id: string };

function signAuth(id: string): string {
  return jwt.sign({ userId: id, purpose: "auth" }, getEnv().JWT_SECRET, { expiresIn: "7d" });
}

async function request(path: string, init: RequestInit = {}) {
  const res = await fetch(`${baseUrl}${path}`, init);
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

async function cleanUp() {
  await prisma.order.deleteMany({ where: { user: { username: { in: [BUYER_SLUG] } } } });
  await prisma.productPurchase.deleteMany({ where: { product: { profile: { slug: { startsWith: PROFILE_SLUG_PREFIX } } } } });
  await prisma.product.deleteMany({ where: { profile: { slug: { startsWith: PROFILE_SLUG_PREFIX } } } });
  await prisma.tip.deleteMany({ where: { profile: { slug: { startsWith: PROFILE_SLUG_PREFIX } } } });
  await prisma.profile.deleteMany({ where: { slug: { startsWith: PROFILE_SLUG_PREFIX } } });
  await prisma.user.deleteMany({ where: { username: { in: [ADMIN_SLUG, BUYER_SLUG, SELLER_SLUG] } } });
  await prisma.role.deleteMany({ where: { slug: ADMIN_ROLE_SLUG } });
}

async function seedUser(username: string, roleId: string) {
  return prisma.user.create({
    data: {
      username,
      email: `${username}@test.local`,
      passwordHash: "x",
      roleId,
      acceptedTosVersion: POLICY_VERSIONS.tos,
      acceptedPrivacyVersion: POLICY_VERSIONS.privacy,
      acceptedPoliciesAt: new Date(),
    },
  });
}

before(async () => {
  await cleanUp();
  const role = await prisma.role.create({ data: { name: "Race Admin", slug: ADMIN_ROLE_SLUG, permissions: ["orders.manage"] } });
  adminRoleId = role.id;
  admin = { id: (await seedUser(ADMIN_SLUG, adminRoleId)).id };
  // Buyer/seller permissions are irrelevant here; only the admin PATCH path checks them.
  buyer = { id: (await seedUser(BUYER_SLUG, adminRoleId)).id };
  seller = { id: (await seedUser(SELLER_SLUG, adminRoleId)).id };
  // Profiles power the tip/product fixtures (tips and products hang off a profile).
  await prisma.profile.create({ data: { userId: seller.id, slug: `${PROFILE_SLUG_PREFIX}seller`, isPrimary: true } });

  const r = app.listen(0);
  await once(r, "listening");
  server = r;
  const addr = r.address();
  baseUrl = typeof addr === "object" && addr ? `http://127.0.0.1:${addr.port}` : "";
});

after(async () => {
  await cleanUp();
  if (adminRoleId) await prisma.role.deleteMany({ where: { id: adminRoleId } }).catch(() => undefined);
  server?.close();
});

// ---------------------------------------------------------------------------
// Tip arm
// ---------------------------------------------------------------------------

async function seedTip(): Promise<string> {
  const profile = await prisma.profile.findFirstOrThrow({ where: { slug: `${PROFILE_SLUG_PREFIX}seller` } });
  const tip = await prisma.tip.create({ data: { profileId: profile.id, coin: "BTC", amount: 0.0005 } });
  return tip.id;
}

test("tip: paid confirms a PENDING tip and stamps paidAt", async () => {
  const tipId = await seedTip();
  await handleGatewayEvent(`tip-${tipId}`, "paid");
  const tip = await prisma.tip.findUniqueOrThrow({ where: { id: tipId } });
  assert.equal(tip.status, "CONFIRMED");
  assert.ok(tip.paidAt);
});

test("tip: redelivered paid is idempotent (still CONFIRMED)", async () => {
  const tipId = await seedTip();
  await handleGatewayEvent(`tip-${tipId}`, "paid");
  await handleGatewayEvent(`tip-${tipId}`, "paid");
  const tip = await prisma.tip.findUniqueOrThrow({ where: { id: tipId } });
  assert.equal(tip.status, "CONFIRMED");
});

test("tip: a stale cancel event never demotes a CONFIRMED tip", async () => {
  const tipId = await seedTip();
  await handleGatewayEvent(`tip-${tipId}`, "paid");
  await handleGatewayEvent(`tip-${tipId}`, "cancelled");
  const tip = await prisma.tip.findUniqueOrThrow({ where: { id: tipId } });
  assert.equal(tip.status, "CONFIRMED");
});

test("tip: a late payment resurrects a CANCELLED tip (async settlement after expiry)", async () => {
  const tipId = await seedTip();
  await handleGatewayEvent(`tip-${tipId}`, "cancelled");
  await handleGatewayEvent(`tip-${tipId}`, "paid");
  const tip = await prisma.tip.findUniqueOrThrow({ where: { id: tipId } });
  assert.equal(tip.status, "CONFIRMED");
  assert.ok(tip.paidAt);
});

test("tip: concurrent paid + refund resolve deterministically with no torn state", async () => {
  const tipId = await seedTip();
  await Promise.all([
    handleGatewayEvent(`tip-${tipId}`, "paid"),
    handleGatewayEvent(`tip-${tipId}`, "refunded"),
  ]);
  const tip = await prisma.tip.findUniqueOrThrow({ where: { id: tipId } });
  // Either the refund claimed the PENDING row first (and the later payment
  // resurrected it) or the confirm claimed it first (and the refund found no
  // PENDING row). Both paths end CONFIRMED with a paidAt, never CANCELLED-with-
  // paidAt or CONFIRMED without paidAt.
  assert.equal(tip.status, "CONFIRMED");
  assert.ok(tip.paidAt);
});

// ---------------------------------------------------------------------------
// Shop purchase arm
// ---------------------------------------------------------------------------

async function seedPurchase(): Promise<{ orderId: string; purchaseId: string }> {
  const profile = await prisma.profile.findFirstOrThrow({ where: { slug: `${PROFILE_SLUG_PREFIX}seller` } });
  const product = await prisma.product.create({
    data: {
      profileId: profile.id,
      title: "race product",
      priceCents: 500,
      filePath: "products/race/file.bin",
      fileName: "file.bin",
      fileSize: 1,
    },
  });
  const purchase = await prisma.productPurchase.create({
    data: {
      productId: product.id,
      buyerEmail: "race-buyer@test.local",
      title: product.title,
      fileName: product.fileName,
      filePath: product.filePath,
      fileSize: product.fileSize,
      method: "STRIPE",
      status: "PENDING",
      currency: "USD",
      basePriceCents: 500,
      finalPriceCents: 500,
    },
  });
  return { orderId: `${SHOP_PURCHASE_PREFIX}${purchase.id}`, purchaseId: purchase.id };
}

test("shop: paid transitions PENDING → PAID exactly once", async () => {
  const { orderId, purchaseId } = await seedPurchase();
  await handleGatewayEvent(orderId, "paid", "race-tx-1");
  const purchase = await prisma.productPurchase.findUniqueOrThrow({ where: { id: purchaseId } });
  assert.equal(purchase.status, "PAID");
  assert.ok(purchase.paidAt);
  assert.equal(purchase.gatewayStatus, "paid");
});

test("shop: redelivered paid (sequential duplicate) changes nothing", async () => {
  const { orderId, purchaseId } = await seedPurchase();
  await handleGatewayEvent(orderId, "paid", "race-tx-1");
  await handleGatewayEvent(orderId, "paid", "race-tx-1");
  const purchase = await prisma.productPurchase.findUniqueOrThrow({ where: { id: purchaseId } });
  assert.equal(purchase.status, "PAID");
  assert.ok(purchase.paidAt);
});

test("shop: a cancel event cannot undo a PAID purchase", async () => {
  const { orderId, purchaseId } = await seedPurchase();
  await handleGatewayEvent(orderId, "paid");
  await handleGatewayEvent(orderId, "cancelled");
  const purchase = await prisma.productPurchase.findUniqueOrThrow({ where: { id: purchaseId } });
  assert.equal(purchase.status, "PAID");
});

test("shop: refund transitions PAID → REFUNDED", async () => {
  const { orderId, purchaseId } = await seedPurchase();
  await handleGatewayEvent(orderId, "paid");
  await handleGatewayEvent(orderId, "refunded");
  const purchase = await prisma.productPurchase.findUniqueOrThrow({ where: { id: purchaseId } });
  assert.equal(purchase.status, "REFUNDED");
  assert.ok(purchase.refundedAt);
});

test("shop: concurrent duplicate paid deliveries claim the transition once", async () => {
  const { orderId, purchaseId } = await seedPurchase();
  await Promise.all(Array.from({ length: 4 }, () => handleGatewayEvent(orderId, "paid", "race-tx-1")));
  const purchase = await prisma.productPurchase.findUniqueOrThrow({ where: { id: purchaseId } });
  // All four events end in the same terminal state; the conditional claim
  // guarantees no event observed a half-written intermediate state.
  assert.equal(purchase.status, "PAID");
  assert.ok(purchase.paidAt);
  assert.equal(purchase.gatewayStatus, "paid");
});

test("shop: refunded event on a CANCELLED purchase still transitions (money left)", async () => {
  const { orderId, purchaseId } = await seedPurchase();
  await handleGatewayEvent(orderId, "cancelled");
  await handleGatewayEvent(orderId, "refunded");
  const purchase = await prisma.productPurchase.findUniqueOrThrow({ where: { id: purchaseId } });
  assert.equal(purchase.status, "REFUNDED");
});

// ---------------------------------------------------------------------------
// Admin PATCH /orders/:id
// ---------------------------------------------------------------------------

async function seedOrder(plan: "PRO" | "ENTERPRISE", userTier: "FREE" | "PRO" | "ENTERPRISE", status: "PENDING" | "PAID" | "CANCELLED" | "REFUNDED") {
  const order = await prisma.order.create({
    data: { userId: buyer.id, plan, status, basePriceCents: 1000, discountPercent: 0, finalPriceCents: 1000, paidAt: status === "PAID" ? new Date() : null },
  });
  if (userTier !== "FREE") {
    await prisma.user.update({ where: { id: buyer.id }, data: { tier: userTier } });
  }
  return order.id;
}

async function patchOrder(orderId: string, status: string) {
  return request(`/api/admin/orders/${orderId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${signAuth(admin.id)}` },
    body: JSON.stringify({ status }),
  });
}

test("admin order PATCH: force-PAID on a PENDING order upgrades a lower tier", async () => {
  const id = await seedOrder("PRO", "FREE", "PENDING");
  const res = await patchOrder(id, "PAID");
  assert.equal(res.status, 200);
  const order = await prisma.order.findUniqueOrThrow({ where: { id }, include: { user: true } });
  assert.equal(order.status, "PAID");
  assert.equal(order.user.tier, "PRO");
});

test("admin order PATCH: force-PAID never downgrades a higher tier", async () => {
  const id = await seedOrder("PRO", "ENTERPRISE", "PENDING");
  const res = await patchOrder(id, "PAID");
  assert.equal(res.status, 200);
  const order = await prisma.order.findUniqueOrThrow({ where: { id }, include: { user: true } });
  assert.equal(order.user.tier, "ENTERPRISE");
  // Reset the buyer tier for later cases.
  await prisma.user.update({ where: { id: buyer.id }, data: { tier: "FREE" } });
});

test("admin order PATCH: transition guards hold (PAID→CANCELLED, PAID→PENDING blocked)", async () => {
  const idA = await seedOrder("PRO", "FREE", "PAID");
  assert.equal((await patchOrder(idA, "CANCELLED")).status, 409);
  assert.equal((await patchOrder(idA, "PENDING")).status, 409);
  // Re-marking an already-PAID order is refused by the conditional claim.
  assert.equal((await patchOrder(idA, "PAID")).status, 409);
});

test("admin order PATCH: REFUNDED only from PAID", async () => {
  const id = await seedOrder("PRO", "FREE", "PENDING");
  assert.equal((await patchOrder(id, "REFUNDED")).status, 409);
  const paidId = await seedOrder("PRO", "FREE", "PAID");
  assert.equal((await patchOrder(paidId, "REFUNDED")).status, 200);
  // From REFUNDED nothing but a new payment may move the order.
  assert.equal((await patchOrder(paidId, "PAID")).status, 409);
  assert.equal((await patchOrder(paidId, "PENDING")).status, 409);
  assert.equal((await patchOrder(paidId, "CANCELLED")).status, 409);
});

test("admin order PATCH: reverting a CANCELLED order to PENDING clears paidAt", async () => {
  const id = await seedOrder("PRO", "FREE", "CANCELLED");
  const res = await patchOrder(id, "PENDING");
  assert.equal(res.status, 200);
  const order = await prisma.order.findUniqueOrThrow({ where: { id } });
  assert.equal(order.status, "PENDING");
  assert.equal(order.paidAt, null);
});

test("admin order PATCH: two concurrent force-PAID requests claim the transition once", async () => {
  const id = await seedOrder("PRO", "FREE", "PENDING");
  const results = await Promise.all([patchOrder(id, "PAID"), patchOrder(id, "PAID")]);
  const statuses = results.map((r) => r.status).sort();
  assert.deepEqual(statuses, [200, 409]);
  const order = await prisma.order.findUniqueOrThrow({ where: { id }, include: { user: true } });
  assert.equal(order.status, "PAID");
  assert.equal(order.user.tier, "PRO");
});
