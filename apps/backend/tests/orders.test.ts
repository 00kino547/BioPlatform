import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma.js";
import { discountedCents, planPrices, billingConfig, createPendingOrder, downgradeUserTier } from "../src/routes/orders.js";

describe("orders pricing helpers", () => {
  test("discountedCents rounds and floors at 0", () => {
    assert.equal(discountedCents(500, 0), 500);
    assert.equal(discountedCents(500, 10), 450);
    assert.equal(discountedCents(499, 33), 334);
    assert.equal(discountedCents(2900, 100), 0);
    assert.equal(discountedCents(2900, -5), 2900);
  });

  test("planPrices / billingConfig read the (test-pinned) env", () => {
    const cfg = billingConfig();
    assert.equal(cfg.billingMode, "one-time");
    assert.equal(cfg.currency, "USD");
    assert.deepEqual(planPrices(), [
      { plan: "PRO", label: "Premium", priceCents: 500 },
      { plan: "ENTERPRISE", label: "Enterprise", priceCents: 2900 },
    ]);
  });
});

describe("order creation flow (DB-backed)", () => {
  const TIER_RANK: Record<string, number> = { FREE: 0, PRO: 1, ENTERPRISE: 2 };
  let roles: { id: string; slug: string }[] = [];
  const users: { id: string; username: string }[] = [];
  let orderIds: string[] = [];

  async function mkRole(slug: string): Promise<{ id: string }> {
    const r = await prisma.role.create({
      data: { name: slug, slug, permissions: ["orders.manage"] },
    });
    return { id: r.id };
  }

  async function mkUser(username: string, roleId: string, tier: "FREE" | "PRO" | "ENTERPRISE" = "FREE") {
    const u = await prisma.user.create({
      data: {
        username,
        email: `${username}@test.local`,
        passwordHash: "not-a-real-hash",
        roleId,
        tier,
      },
    });
    users.push({ id: u.id, username });
    return u;
  }

  before(async () => {
    await prisma.order.deleteMany();
    await prisma.user.deleteMany();
    await prisma.role.deleteMany();
    const admin = await mkRole("admin_orders_test");
    const user = await mkRole("user_orders_test");
    roles = [admin, user];
  });

  after(async () => {
    await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    orderIds = [];
    await prisma.user.deleteMany();
    await prisma.role.deleteMany();
  });

  async function createOrder(userId: string, plan: "PRO" | "ENTERPRISE", discountPercent: number) {
    const planPrice = planPrices().find((p) => p.plan === plan);
    const basePriceCents = planPrice!.priceCents;
    const finalPriceCents = discountedCents(basePriceCents, discountPercent);
    const order = await prisma.order.create({
      data: {
        userId,
        plan,
        method: "MANUAL",
        status: "PENDING",
        currency: "USD",
        basePriceCents,
        discountPercent,
        finalPriceCents,
      },
    });
    orderIds.push(order.id);
    return order;
  }

  test("a FREE user can create a PENDING PRO order with the server-computed price", async () => {
    const u = await mkUser(`orders_free_${Math.random().toString(36).slice(2, 8)}`, roles[1].id, "FREE");
    const order = await createOrder(u.id, "PRO", 0);
    assert.equal(order.status, "PENDING");
    assert.equal(order.basePriceCents, 500);
    assert.equal(order.finalPriceCents, 500);
    assert.equal(TIER_RANK[order.plan], 1);
  });

  test("discount is baked into the final price and recorded on the order", async () => {
    const u = await mkUser(`orders_disc_${Math.random().toString(36).slice(2, 8)}`, roles[1].id, "FREE");
    const order = await createOrder(u.id, "PRO", 10);
    assert.equal(order.discountPercent, 10);
    assert.equal(order.finalPriceCents, 450);
  });

  test("marking an order PAID upgrades the user tier to the ordered plan", async () => {
    const u = await mkUser(`orders_paid_${Math.random().toString(36).slice(2, 8)}`, roles[1].id, "FREE");
    const order = await createOrder(u.id, "ENTERPRISE", 0);

    await prisma.$transaction(async (tx) => {
      await tx.order.update({ where: { id: order.id }, data: { status: "PAID", paidAt: new Date() } });
      await tx.user.update({ where: { id: u.id }, data: { tier: order.plan } });
    });

    const updated = await prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    assert.equal(updated.tier, "ENTERPRISE");
  });

  test("a PRO user ordering PRO again stays PRO (no downgrade/upgrade)", async () => {
    const u = await mkUser(`orders_same_${Math.random().toString(36).slice(2, 8)}`, roles[1].id, "PRO");
    const currentRank = TIER_RANK[u.tier];
    const toPlan = "PRO";
    if (TIER_RANK[toPlan] > currentRank) {
      assert.fail("expected equal-rank order to not upgrade");
    }
    assert.equal(TIER_RANK[toPlan], currentRank);
  });

  test("tier rank ordering is FREE < PRO < ENTERPRISE", async () => {
    assert.ok(TIER_RANK["FREE"] < TIER_RANK["PRO"]);
    assert.ok(TIER_RANK["PRO"] < TIER_RANK["ENTERPRISE"]);
  });

  test("concurrent duplicate checkout requests create exactly one PENDING order", async () => {
    const u = await mkUser(`orders_race_${Math.random().toString(36).slice(2, 8)}`, roles[1].id, "FREE");
    const base = () => ({
      method: "MANUAL" as const,
      currency: "USD",
      basePriceCents: 500,
      discountPercent: 0,
      finalPriceCents: 500,
      adminNote: undefined,
      cryptoCoin: null,
    });

    // Two simultaneous checkout attempts for the same user+plan: the row lock
    // serializes them, so exactly one creates an order and the other is
    // rejected with the "pending order exists" error instead of also inserting
    // a second PENDING row (TOCTOU between findFirst and create).
    const results = await Promise.allSettled([
      createPendingOrder(u.id, "PRO", base()),
      createPendingOrder(u.id, "PRO", base()),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    assert.equal(fulfilled.length, 1, `expected exactly one success, got ${JSON.stringify(results.map((r) => r.status))}`);
    assert.equal(rejected.length, 1, `expected exactly one rejection, got ${JSON.stringify(results.map((r) => r.status))}`);

    const count = await prisma.order.count({ where: { userId: u.id, plan: "PRO", status: "PENDING" } });
    assert.equal(count, 1, "only one PENDING order may exist for a user+plan");

    const pendingOrders = await prisma.order.findMany({ where: { userId: u.id, plan: "PRO", status: "PENDING" }, select: { id: true } });
    orderIds = orderIds.filter((id) => !pendingOrders.some((o) => o.id === id));
    orderIds.push(...pendingOrders.map((o) => o.id));
  });
});

describe("self-service downgrade (symmetric tier change, DB-backed)", () => {
  let role: { id: string };
  const userIds: string[] = [];

  async function mkUser(username: string, tier: "FREE" | "PRO" | "ENTERPRISE") {
    const u = await prisma.user.create({
      data: { username, email: `${username}@test.local`, passwordHash: "not-a-real-hash", roleId: role.id, tier },
    });
    userIds.push(u.id);
    return u;
  }

  before(async () => {
    // The previous describe wipes users/roles; rebuild an isolated fixture set.
    await prisma.enterpriseSso.deleteMany();
    await prisma.profile.deleteMany();
    await prisma.order.deleteMany();
    await prisma.user.deleteMany();
    await prisma.role.deleteMany();
    role = await prisma.role.create({ data: { name: "downgrade_test", slug: "downgrade_test", permissions: [] } });
  });

  after(async () => {
    await prisma.enterpriseSso.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.profile.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.order.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.role.deleteMany();
  });

  const uniq = () => Math.random().toString(36).slice(2, 8);

  test("ENTERPRISE → PRO strips seats + SSO enforcement but keeps extra profiles (soft-disable)", async () => {
    const u = await mkUser(`dg_ent_${uniq()}`, "ENTERPRISE");
    await prisma.user.update({ where: { id: u.id }, data: { seatLimit: 5 } });
    await prisma.enterpriseSso.create({
      data: {
        userId: u.id,
        issuerUrl: "https://idp.example.test",
        clientId: "client",
        clientSecret: "secret",
        displayName: "Test IdP",
        enforced: true,
      },
    });
    // A profile beyond the PRO limit must never be deleted by a downgrade.
    const profile = await prisma.profile.create({ data: { userId: u.id, slug: `dg_${uniq()}`, isPrimary: true } });
    const pending = await prisma.order.create({
      data: {
        userId: u.id, plan: "PRO", method: "MANUAL", status: "PENDING", currency: "USD",
        basePriceCents: 500, discountPercent: 0, finalPriceCents: 500,
      },
    });

    const result = await downgradeUserTier(u.id, "PRO");

    assert.equal(result.tier, "PRO");
    assert.equal(result.previousTier, "ENTERPRISE");
    assert.equal(result.cancelledOrders, 1);

    const user = await prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    assert.equal(user.tier, "PRO");
    assert.equal(user.seatLimit, null, "gifted seat cap is cleared on downgrade");

    const sso = await prisma.enterpriseSso.findUniqueOrThrow({ where: { userId: u.id } });
    assert.equal(sso.enforced, false, "SSO enforcement is switched off");
    assert.equal(sso.displayName, "Test IdP", "SSO config itself is retained (soft-disable)");

    const cancelled = await prisma.order.findUniqueOrThrow({ where: { id: pending.id } });
    assert.equal(cancelled.status, "CANCELLED", "pending upgrade is cancelled so a late webhook can't re-upgrade");

    const kept = await prisma.profile.findUnique({ where: { id: profile.id } });
    assert.ok(kept, "existing over-limit profile is not deleted");
  });

  test("PRO → FREE works and FREE/PRO can't downgrade to a same-or-higher plan", async () => {
    const pro = await mkUser(`dg_pro_${uniq()}`, "PRO");
    assert.equal((await downgradeUserTier(pro.id, "FREE")).tier, "FREE");

    const pro2 = await mkUser(`dg_pro2_${uniq()}`, "PRO");
    await assert.rejects(() => downgradeUserTier(pro2.id, "PRO"), /already on the Premium plan/i);

    const free = await mkUser(`dg_free_${uniq()}`, "FREE");
    await assert.rejects(() => downgradeUserTier(free.id, "PRO"), /already on the Free plan/i);
  });

  test("PAID order history is untouched by a downgrade", async () => {
    const u = await mkUser(`dg_hist_${uniq()}`, "ENTERPRISE");
    const paid = await prisma.order.create({
      data: {
        userId: u.id, plan: "ENTERPRISE", method: "MANUAL", status: "PAID", currency: "USD",
        basePriceCents: 2900, discountPercent: 0, finalPriceCents: 2900, paidAt: new Date(),
      },
    });

    await downgradeUserTier(u.id, "FREE");

    const after = await prisma.order.findUniqueOrThrow({ where: { id: paid.id } });
    assert.equal(after.status, "PAID");
  });
});