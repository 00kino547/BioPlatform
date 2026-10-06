import { test, describe, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import jwt from "jsonwebtoken";
import app from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { getEnv } from "../src/config/env.js";
import { POLICY_VERSIONS } from "../src/lib/newsletter.js";
import { isEmailEnabled } from "../src/lib/email.js";
import {
  MAX_PACK_QUANTITY,
  parseInvitePacks,
  priceForPackQuantity,
} from "../src/lib/invitePricing.js";
import {
  allocateInviteCredits,
  applyInviteBanPolicy,
  getInviteGenerationEnabled,
  getInvitePurchaseEnabled,
  setInviteGenerationEnabled,
  remainingCreditsForSource,
  setInvitePurchaseEnabled,
  setInviteResaleMode,
  sweepLapsedPurchasedAllowance,
} from "../src/lib/inviteService.js";
import {
  INVITE_PURCHASE_PREFIX,
  adoptGuestPurchase,
  fulfillInvitePurchase,
  guestPurchaseOrderId,
  notifyGuestPurchaseCodes,
  refundInvitePurchase,
} from "../src/lib/inviteOrders.js";
import { resetBuyRateLimitForTests } from "../src/routes/invitePurchase.js";
import { setContactConfig } from "../src/lib/contactConfig.js";
import { clearPolicyContextCache } from "../src/lib/policyContextCache.js";

const ROLE_SLUG = "invpay_role";
const USER_PREFIX = "invpay_";

describe("invite pack pricing", () => {
  test("parses quantity:price pairs and derives a per-credit price", () => {
    const packs = parseInvitePacks("1:100, 3:200 ,10:800");
    assert.equal(packs.length, 3);
    assert.deepEqual(
      packs.map((p) => p.quantity),
      [1, 3, 10],
    );
    // Rounded up, never down: an understated unit price would overstate the discount.
    assert.deepEqual(
      packs.map((p) => p.unitCents),
      [100, 67, 80],
    );
    assert.equal(packs.find((p) => p.quantity === 3)?.bestValue, true);
  });

  test("skips malformed entries instead of failing the whole checkout", () => {
    const packs = parseInvitePacks("1:100,0:50,-3:20,2:0,2:abc,4:100:9,5:250,51:100,abc");
    assert.deepEqual(
      packs.map((p) => p.quantity),
      [1, 5],
    );
  });

  test("keeps the cheapest price when a quantity is repeated", () => {
    const packs = parseInvitePacks("3:250,3:200");
    assert.equal(packs.length, 1);
    assert.equal(packs[0].priceCents, 200);
  });

  test("resolves exact quantities only, so bulk rates cannot be improvised", () => {
    const packs = parseInvitePacks("1:100,10:800");
    assert.equal(priceForPackQuantity(packs, 10)?.priceCents, 800);
    // 5 credits is not on sale; pricing it at the 10-pack unit rate would hand out
    // a discount nobody configured.
    assert.equal(priceForPackQuantity(packs, 5), null);
    assert.equal(priceForPackQuantity(packs, MAX_PACK_QUANTITY + 1), null);
  });

  test("a free price is rejected outright", () => {
    assert.deepEqual(parseInvitePacks("1:0,2:-100"), []);
  });
});

describe("paid invite credits", () => {
  let server: Server;
  let baseUrl: string;
  const roleIds: string[] = [];
  let roleId: string;
  const userIds: string[] = [];
  let previousPurchaseEnabled = false;
  let previousGenerationEnabled = false;

  // `invites.manage` is what the invite purchase settings route requires, and the
  // shared test role already carries it.
  let adminSeq = 0;
  async function adminToken(): Promise<string> {
    adminSeq += 1;
    return signAuth(await newUser(`settings_admin_${adminSeq}`));
  }

  function signAuth(id: string): string {
    return jwt.sign({ userId: id, purpose: "auth" }, getEnv().JWT_SECRET, { expiresIn: "7d" });
  }

  async function newUser(suffix: string, extra: Record<string, unknown> = {}): Promise<string> {
    const user = await prisma.user.create({
      data: {
        acceptedTosVersion: POLICY_VERSIONS.tos,
        acceptedPrivacyVersion: POLICY_VERSIONS.privacy,
        acceptedPoliciesAt: new Date(),
        username: `${USER_PREFIX}${suffix}`,
        email: `${USER_PREFIX}${suffix}@test.local`,
        passwordHash: "x",
        roleId,
        ...extra,
      },
    });
    userIds.push(user.id);
    return user.id;
  }

  async function newOrder(input: {
    userId: string | null;
    quantity?: number;
    email?: string;
    method?: "MANUAL" | "STRIPE";
  }): Promise<string> {
    const id = `${INVITE_PURCHASE_PREFIX}${Math.random().toString(16).slice(2, 18)}`;
    await prisma.invitePurchaseOrder.create({
      data: {
        id,
        userId: input.userId,
        buyerEmail: input.email ?? `${USER_PREFIX}buyer@test.local`,
        quantity: input.quantity ?? 1,
        priceCents: 100,
        currency: "USD",
        method: input.method ?? "MANUAL",
      },
    });
    return id;
  }

  // Every test starts with a clean per-IP purchase budget. Without this the suite
  // only passed as long as the total number of storefront calls stayed under 10 per
  // minute, so an unrelated new test could fail an unrelated old one with a 429.
  beforeEach(() => resetBuyRateLimitForTests());

  before(async () => {
    previousPurchaseEnabled = await getInvitePurchaseEnabled();
    previousGenerationEnabled = await getInviteGenerationEnabled();
    await setInvitePurchaseEnabled(true);
    // The generation tests restore this to its prior value, so a run that lands
    // after them would otherwise 403 every generation case for the wrong reason.
    await setInviteGenerationEnabled(true);

    await prisma.inviteCode.deleteMany({
      where: { OR: [{ createdBy: { username: { startsWith: USER_PREFIX } } }, { note: { startsWith: "invite purchase" } }] },
    });
    await prisma.invitePurchaseOrder.deleteMany({
      where: { OR: [{ userId: { in: await prisma.user.findMany({ where: { username: { startsWith: USER_PREFIX } }, select: { id: true } }).then((u) => u.map((x) => x.id)) } }, { buyerEmail: { startsWith: USER_PREFIX } }] },
    });
    await prisma.user.deleteMany({ where: { username: { startsWith: USER_PREFIX } } });
    await prisma.role.deleteMany({ where: { slug: { startsWith: ROLE_SLUG } } });

    const role = await prisma.role.create({
      data: { name: "InvPay Role", slug: ROLE_SLUG, permissions: ["invites.manage"] },
    });
    roleId = role.id;

    server = app.listen(0);
    await new Promise<void>((resolve) => server.once("listening", () => resolve()));
    const addr = server.address();
    baseUrl = typeof addr === "object" && addr ? `http://127.0.0.1:${addr.port}` : "";
  });

  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await prisma.inviteCode.deleteMany({
      where: { OR: [{ createdById: { in: userIds } }, { note: { startsWith: "invite purchase" } }] },
    });
    await prisma.invitePurchaseOrder.deleteMany({
      where: { OR: [{ userId: { in: userIds } }, { buyerEmail: { startsWith: USER_PREFIX } }] },
    });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.role.deleteMany({ where: { slug: { startsWith: ROLE_SLUG } } });
    await setInvitePurchaseEnabled(previousPurchaseEnabled);
    await setInviteGenerationEnabled(previousGenerationEnabled);
    await setContactConfig("none", "");
    await setInviteResaleMode("off");
    await clearPolicyContextCache();
  });

  // ---------------------------------------------------------------- member path

  test("fulfilling a member purchase credits the balance through the ledger", async () => {
    const userId = await newUser("member");
    const orderId = await newOrder({ userId, quantity: 3 });

    const result = await fulfillInvitePurchase(orderId);
    assert.deepEqual(result, { credited: true, quantity: 3 });

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { inviteAllowance: true } });
    assert.equal(user?.inviteAllowance, 3);

    // The grant is what makes the credit auditable and refundable.
    const grants = await prisma.inviteCreditGrant.findMany({ where: { userId } });
    assert.equal(grants.length, 1);
    assert.equal(grants[0].source, "PURCHASED");
    assert.equal(grants[0].quantity, 3);
    assert.equal(grants[0].orderId, orderId);
    // Member credits are perpetual: nothing here is time-limited.
    assert.equal(grants[0].expiresAt, null);
  });

  test("a redelivered paid webhook cannot credit twice", async () => {
    const userId = await newUser("redeliver");
    const orderId = await newOrder({ userId, quantity: 2 });

    assert.equal((await fulfillInvitePurchase(orderId)).credited, true);
    const second = await fulfillInvitePurchase(orderId);

    assert.equal(second.credited, false);
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { inviteAllowance: true } });
    assert.equal(user?.inviteAllowance, 2, "balance must not move on redelivery");
    assert.equal(await prisma.inviteCreditGrant.count({ where: { orderId } }), 1);
  });

  // ----------------------------------------------------------------- guest path

  test("fulfilling a guest purchase mints bounded codes instead of crediting", async () => {
    const orderId = await newOrder({ userId: null, quantity: 2, email: `${USER_PREFIX}guest@test.local` });

    assert.equal((await fulfillInvitePurchase(orderId)).credited, true);

    const codes = await prisma.inviteCode.findMany({ where: { note: `invite purchase ${orderId}` } });
    assert.equal(codes.length, 2);
    for (const code of codes) {
      assert.equal(code.createdById, null, "no account owns a guest code yet");
      assert.equal(code.purchased, true);
      assert.ok(code.expiresAt, "a guest code must not live forever");
      const ttlDays = (code.expiresAt!.getTime() - Date.now()) / 86400000;
      assert.ok(ttlDays > 29 && ttlDays <= 30, `unexpected code ttl ${ttlDays}`);
      assert.equal(guestPurchaseOrderId(code.note), orderId);
    }
    // No account means nothing to credit: the codes are the product.
    assert.equal(await prisma.inviteCreditGrant.count({ where: { orderId } }), 0);
  });

  // The claim email carries the only copy of the token a guest has, so a failed
  // send must stay retryable instead of being recorded as delivered.
  test("a failed codes email leaves the order un-notified and retryable", async () => {
    // Skipped rather than faked when mail IS configured: sending through a real
    // provider from a test would be wrong. The CI job runs no mail service.
    const mailReady = isEmailEnabled();
    const orderId = await newOrder({ userId: null, quantity: 2, email: `${USER_PREFIX}nofile@test.local` });
    await fulfillInvitePurchase(orderId);

    const notified = await notifyGuestPurchaseCodes(orderId);
    const stored = await prisma.invitePurchaseOrder.findUnique({ where: { id: orderId } });

    if (mailReady) {
      assert.equal(notified, true);
      assert.notEqual(stored?.codesNotifiedAt, null);
      return;
    }

    assert.equal(notified, false, "a failed send must not report success");
    assert.equal(stored?.codesNotifiedAt, null, "the order must stay retryable");
    assert.equal(await prisma.inviteCode.count({ where: { note: `invite purchase ${orderId}`, usedAt: null } }), 2,
      "the codes must survive a failed email so a retry still has something to send");
  });

  test("an already-notified guest order is not mailed twice", async () => {
    const orderId = await newOrder({ userId: null, quantity: 2, email: `${USER_PREFIX}once@test.local` });
    await fulfillInvitePurchase(orderId);
    await prisma.invitePurchaseOrder.update({
      where: { id: orderId },
      data: { codesNotifiedAt: new Date() },
    });

    assert.equal(await notifyGuestPurchaseCodes(orderId), false);
  });

  test("a member purchase is never mailed", async () => {
    const userId = await newUser("notify_member");
    const orderId = await newOrder({ userId, quantity: 2, email: `${USER_PREFIX}member@test.local` });
    await fulfillInvitePurchase(orderId);

    assert.equal(await notifyGuestPurchaseCodes(orderId), false);
    assert.equal(
      (await prisma.invitePurchaseOrder.findUnique({ where: { id: orderId } }))?.codesNotifiedAt,
      null
    );
  });

  test("redeeming one guest code adopts the rest of the purchase", async () => {
    const orderId = await newOrder({ userId: null, quantity: 3, email: `${USER_PREFIX}adopt@test.local` });
    await fulfillInvitePurchase(orderId);
    const newId = await newUser("adopter");

    const adopted = await adoptGuestPurchase(newId, orderId);
    assert.equal(adopted.adopted, 3);
    assert.equal(adopted.alreadyClaimed, false);

    const order = await prisma.invitePurchaseOrder.findUnique({ where: { id: orderId } });
    assert.equal(order?.claimedById, newId);

    const codes = await prisma.inviteCode.findMany({ where: { note: `invite purchase ${orderId}` } });
    assert.equal(codes.length, 0, "the order marker is cleared once codes have an owner");
    const owned = await prisma.inviteCode.count({ where: { createdById: newId, purchased: true } });
    assert.equal(owned, 3);
  });

  test("a purchase cannot be adopted twice", async () => {
    const orderId = await newOrder({ userId: null, quantity: 2, email: `${USER_PREFIX}double@test.local` });
    await fulfillInvitePurchase(orderId);
    const first = await newUser("claim_first");
    const second = await newUser("claim_second");

    assert.equal((await adoptGuestPurchase(first, orderId)).adopted, 2);
    const late = await adoptGuestPurchase(second, orderId);

    assert.equal(late.adopted, 0);
    assert.equal(late.alreadyClaimed, true);
    assert.equal(await prisma.inviteCode.count({ where: { createdById: second, purchased: true } }), 0);
  });

  test("a used code is not handed to the next adopter", async () => {
    const orderId = await newOrder({ userId: null, quantity: 2, email: `${USER_PREFIX}used@test.local` });
    await fulfillInvitePurchase(orderId);
    const spent = await prisma.inviteCode.findFirst({ where: { note: `invite purchase ${orderId}` } });
    await prisma.inviteCode.update({
      where: { id: spent!.id },
      data: { usedById: (await newUser("used_by")), usedAt: new Date() },
    });

    const adopter = await newUser("used_adopter");
    const result = await adoptGuestPurchase(adopter, orderId);
    assert.equal(result.adopted, 1, "only the unspent code transfers");
  });

  // -------------------------------------------------------------------- refunds

  test("refunding one purchase leaves codes from another purchase alone", async () => {
    const userId = await newUser("refund_two");
    const first = await newOrder({ userId, quantity: 1 });
    const second = await newOrder({ userId, quantity: 1 });
    await fulfillInvitePurchase(first);
    await fulfillInvitePurchase(second);

    // One code per order, each attributed to the grant that paid for it.
    for (const orderId of [first, second]) {
      const grant = await prisma.inviteCreditGrant.findFirst({ where: { orderId } });
      await prisma.inviteCode.create({
        data: {
          code: `${Math.random().toString(16).slice(2, 18)}`,
          createdById: userId,
          purchased: true,
          purchasedAt: new Date(),
          sourceGrantId: grant!.id,
          fromAllowance: true,
        },
      });
    }

    assert.equal(await refundInvitePurchase(first), true);

    const grants = {
      first: await prisma.inviteCreditGrant.findFirst({ where: { orderId: first } }),
      second: await prisma.inviteCreditGrant.findFirst({ where: { orderId: second } }),
    };
    assert.ok(grants.first?.revokedAt, "the refunded order's grant is revoked");
    assert.equal(grants.second?.revokedAt, null, "the other order's grant is untouched");

    const after = await prisma.inviteCode.findMany({
      where: { createdById: userId, sourceGrantId: { in: [grants.first!.id, grants.second!.id] } },
    });
    const byGrant = new Map(after.map((c) => [c.sourceGrantId, c]));
    assert.ok(byGrant.get(grants.first!.id)?.revokedAt, "the refunded order's code is revoked");
    assert.equal(byGrant.get(grants.second!.id)?.revokedAt, null, "a still-valid order's code survives");

    // Credits are revoked, not returned: the buyer got the money back, so letting
    // them keep the credit would be the only double-spend available here.
    assert.equal(await remainingCreditsForSource(userId, "PURCHASED"), 0);
  });

  test("a redeemed code stays valid after its purchase is refunded", async () => {
    const userId = await newUser("refund_used");
    const orderId = await newOrder({ userId, quantity: 1 });
    await fulfillInvitePurchase(orderId);
    const grant = await prisma.inviteCreditGrant.findFirst({ where: { orderId } });
    const code = await prisma.inviteCode.create({
      data: {
        code: `${Math.random().toString(16).slice(2, 18)}`,
        createdById: userId,
        purchased: true,
        purchasedAt: new Date(),
        sourceGrantId: grant!.id,
        usedById: await newUser("refund_used_by"),
        usedAt: new Date(),
        fromAllowance: true,
      },
    });

    await refundInvitePurchase(orderId);

    const after = await prisma.inviteCode.findUnique({ where: { id: code.id } });
    assert.equal(after?.revokedAt, null, "the person who joined must not be locked out");
  });

  test("refunding twice is a no-op", async () => {
    const userId = await newUser("refund_twice");
    const orderId = await newOrder({ userId, quantity: 1 });
    await fulfillInvitePurchase(orderId);
    assert.equal(await refundInvitePurchase(orderId), true);
    assert.equal(await refundInvitePurchase(orderId), false);
  });

  // ----------------------------------------------------------------------- bans

  test("a ban keeps purchased credits and drops earned ones", async () => {
    const userId = await newUser("ban_mixed");
    await prisma.inviteCreditGrant.create({
      data: { userId, source: "EVENT", quantity: 5, expiresAt: null },
    });
    await prisma.inviteCreditGrant.create({
      data: { userId, source: "PURCHASED", quantity: 4, expiresAt: null },
    });
    await prisma.user.update({ where: { id: userId }, data: { inviteAllowance: 9 } });

    const policy = await applyInviteBanPolicy(userId);

    // Only the paid 4 survive, and they get a bounded window rather than being
    // wiped or being held open indefinitely.
    assert.equal(policy.inviteAllowance, 4);
    assert.ok(policy.inviteAllowanceExpiresAt);
    const windowDays = (policy.inviteAllowanceExpiresAt!.getTime() - Date.now()) / 86400000;
    assert.ok(windowDays > 13 && windowDays <= 14, `unexpected ban window ${windowDays}`);
  });

  test("a ban with nothing purchased zeroes the balance", async () => {
    const userId = await newUser("ban_no_purchase");
    await prisma.inviteCreditGrant.create({
      data: { userId, source: "EVENT", quantity: 3, expiresAt: null },
    });
    const policy = await applyInviteBanPolicy(userId);
    assert.equal(policy.inviteAllowance, 0);
    assert.equal(policy.inviteAllowanceExpiresAt, undefined);
  });

  test("a restricted draw refuses event credits", async () => {
    const userId = await newUser("draw_source");
    // Event credits expire soonest, so an unrestricted draw would take them first.
    await prisma.inviteCreditGrant.create({
      data: { userId, source: "EVENT", quantity: 5, expiresAt: new Date(Date.now() + 86400000) },
    });
    await prisma.inviteCreditGrant.create({
      data: { userId, source: "PURCHASED", quantity: 5, expiresAt: null },
    });

    const restricted = await allocateInviteCredits(userId, 5, prisma, ["PURCHASED"]);
    assert.equal(restricted.length, 1);
    assert.equal(restricted[0].source, "PURCHASED");
    assert.equal(restricted[0].quantity, 5);

    const unrestricted = await allocateInviteCredits(userId, 5, prisma);
    assert.equal(unrestricted[0].source, "EVENT", "without a restriction the expiring grant wins");
  });

  // ---------------------------------------------------------------------- sweep

  test("a lapsed ban window restores the credit quantity, not the grant count", async () => {
    const userId = await newUser("sweep_quantity", { inviteBanned: true, inviteAllowance: 0 });
    const grant = await prisma.inviteCreditGrant.create({
      data: {
        userId,
        source: "PURCHASED",
        quantity: 3,
        expiresAt: new Date(Date.now() - 1000),
      },
    });
    await prisma.inviteCode.create({
      data: {
        code: `${Math.random().toString(16).slice(2, 18)}`,
        createdById: userId,
        purchased: true,
        purchasedAt: new Date(),
        sourceGrantId: grant.id,
        usedAt: null,
        fromAllowance: true,
      },
    });

    await sweepLapsedPurchasedAllowance();

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { inviteAllowance: true, inviteAllowanceExpiresAt: true } });
    // One grant of 3 credits, so the restore is 3. Counting rows would grant 1.
    assert.equal(user?.inviteAllowance, 3);
    assert.equal(user?.inviteAllowanceExpiresAt, null, "the window must clear or the restore is unreachable");

    const code = await prisma.inviteCode.findFirst({ where: { createdById: userId } });
    assert.ok(code?.revokedAt, "restored credits and live codes would be spendable twice");
  });

  test("a lapsed purchase for a normal account is revoked, not restored", async () => {
    const userId = await newUser("sweep_normal", { inviteBanned: false, inviteAllowance: 1 });
    const grant = await prisma.inviteCreditGrant.create({
      data: { userId, source: "PURCHASED", quantity: 2, expiresAt: new Date(Date.now() - 1000) },
    });
    await prisma.inviteCode.create({
      data: {
        code: `${Math.random().toString(16).slice(2, 18)}`,
        createdById: userId,
        purchased: true,
        purchasedAt: new Date(),
        sourceGrantId: grant.id,
        fromAllowance: true,
      },
    });

    await sweepLapsedPurchasedAllowance();

    const after = await prisma.inviteCreditGrant.findUnique({ where: { id: grant.id } });
    assert.ok(after?.recoveredAt, "the sweep marks what it handled, so it cannot repeat");
    assert.equal(await remainingCreditsForSource(userId, "PURCHASED"), 0);
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { inviteAllowance: true } });
    assert.equal(user?.inviteAllowance, 1, "a normal account loses the lapsed credits instead");
  });

  test("the sweep is idempotent", async () => {
    const userId = await newUser("sweep_idem", { inviteBanned: true, inviteAllowance: 0 });
    await prisma.inviteCreditGrant.create({
      data: { userId, source: "PURCHASED", quantity: 2, expiresAt: new Date(Date.now() - 1000) },
    });

    await sweepLapsedPurchasedAllowance();
    await sweepLapsedPurchasedAllowance();

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { inviteAllowance: true } });
    assert.equal(user?.inviteAllowance, 2, "a second pass must not credit again");
  });

  // ---------------------------------------------------------------------- routes

  test("the storefront reports packs and the resale mode", async () => {
    const res = await fetch(`${baseUrl}/api/invite-purchases/config`);
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.data.open, true);
    assert.ok(Array.isArray(body.data.packs));
    assert.ok(["off", "permitted", "legal", "enforced"].includes(body.data.resale.mode));
  });

  test("a closed store refuses to sell", async () => {
    await setInvitePurchaseEnabled(false);
    try {
      const res = await fetch(`${baseUrl}/api/invite-purchases`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${signAuth(await newUser("closed"))}` },
        body: JSON.stringify({ quantity: 1, method: "MANUAL" }),
      });
      assert.equal(res.status, 403);
    } finally {
      await setInvitePurchaseEnabled(true);
    }
  });

  test("only configured pack quantities are purchasable", async () => {
    const userId = await newUser("odd_quantity");
    const token = signAuth(userId);
    // 7 credits is not a configured pack.
    const res = await fetch(`${baseUrl}/api/invite-purchases`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ quantity: 7, method: "MANUAL" }),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.error, /not available/i);
  });

  test("a banned account cannot buy credits", async () => {
    const userId = await newUser("banned_buy", { inviteBanned: true });
    const res = await fetch(`${baseUrl}/api/invite-purchases`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${signAuth(userId)}` },
      body: JSON.stringify({ quantity: 1, method: "MANUAL" }),
    });
    assert.equal(res.status, 403);
  });

  test("a guest purchase needs an email to receive the codes", async () => {
    const res = await fetch(`${baseUrl}/api/invite-purchases`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quantity: 1, method: "MANUAL" }),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.error, /email/i);
  });

  test("the guest status page refuses an unverified or mismatched token", async () => {
    const orderId = await newOrder({ userId: null, quantity: 1, email: `${USER_PREFIX}status@test.local` });
    const forged = await fetch(`${baseUrl}/api/invite-purchases/status/${orderId}?token=not-a-token`);
    assert.equal(forged.status, 403);

    const mismatched = await fetch(`${baseUrl}/api/invite-purchases/status/${orderId}?token=`);
    assert.equal(mismatched.status, 403);
  });

  test("a member can only mint a claim link for their own purchase", async () => {
    const owner = await newUser("claim_owner");
    const stranger = await newUser("claim_stranger");
    const orderId = await newOrder({ userId: owner, quantity: 1 });

    const res = await fetch(`${baseUrl}/api/invite-purchases/claim-link-auth`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${signAuth(stranger)}` },
      body: JSON.stringify({ orderId }),
    });
    assert.equal(res.status, 404);

    const ok = await fetch(`${baseUrl}/api/invite-purchases/claim-link-auth`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${signAuth(owner)}` },
      body: JSON.stringify({ orderId }),
    });
    assert.equal(ok.status, 200);
    const body = await ok.json();
    assert.match(body.data.url, new RegExp(`/${orderId}\\?token=`));
  });

  test("the admin claim link lets an operator deliver codes when the mailer is down", async () => {
    // The whole reason this endpoint exists: a guest order is only ever handed over
    // by email, so an instance with no working SMTP could confirm payment and then
    // have no way at all to deliver. The admin link must therefore verify against
    // the real status endpoint, not just look like a URL.
    const orderId = await newOrder({ userId: null, quantity: 1 });
    await fulfillInvitePurchase(orderId);

    const res = await fetch(`${baseUrl}/api/admin/invite-purchases/${orderId}/claim-link`, {
      method: "POST",
      headers: { Authorization: `Bearer ${signAuth(await newUser("ops_deliver"))}` },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.data.emailed, false, "nothing was emailed, which is the whole problem");
    assert.ok(body.data.expiresInDays > 0);

    // Extract the token the way the browser would and use it against the guest page.
    const url = new URL(body.data.url);
    assert.equal(url.pathname, `/invites/purchased/${orderId}`);

    const status = await fetch(
      `${baseUrl}/api/invite-purchases/status/${orderId}?token=${url.searchParams.get("token")}`,
    );
    assert.equal(status.status, 200);
    const codes = (await status.json()).data.codes;
    assert.equal(codes.length, 1, "the link the operator copied actually reveals the code");
    // The link is a delivery mechanism, not a licence: the codes stay behind it
    // rather than appearing in the admin response itself.
    assert.equal(JSON.stringify(body).includes(codes[0].code), false);
  });

  test("reloading the storefront does not spend the checkout budget", async () => {
    // /config shared the 10/min purchase limiter, so a buyer who refreshed the
    // store page a few times could be 429'd on the checkout they were attempting.
    for (let i = 0; i < 12; i++) {
      const res = await fetch(`${baseUrl}/api/invite-purchases/config`);
      assert.equal(res.status, 200, `storefront read ${i + 1} must not be rate limited`);
    }
    // The purchase budget itself is still tight.
    let limited = 0;
    for (let i = 0; i < 12; i++) {
      const res = await fetch(`${baseUrl}/api/invite-purchases`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantity: 1, method: "MANUAL", email: "flood@example.test" }),
      });
      if (res.status === 429) limited++;
    }
    assert.ok(limited > 0, "creating orders must stay rate limited");
  });

  test("the public claim-link resend reports the real send outcome, not a hardcoded yes", async () => {
    // It used to answer a literal `sent: true` after ignoring the mailer's result,
    // so a buyer on an instance with no working mailer was told their link had been
    // re-sent and then waited for a message that could never arrive.
    const orderId = await newOrder({ userId: null, quantity: 1, buyerEmail: "resend@example.test" });
    await fulfillInvitePurchase(orderId);

    const res = await fetch(`${baseUrl}/api/invite-purchases/claim-link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId }),
    });
    // Always 200 so the endpoint cannot be used to probe for order ids.
    assert.equal(res.status, 200);
    const body = await res.json();
    // The test env has no usable mailbox, so "sent" must be false.
    assert.equal(body.data.sent, false, "a send that never happened must not be reported as sent");
  });

  test("the guest status reports whether the codes email actually went out", async () => {
    // A paid buyer has to be able to tell "check spam" from "nothing was ever sent".
    const orderId = await newOrder({ userId: null, quantity: 1, buyerEmail: "notified@example.test" });
    await fulfillInvitePurchase(orderId);

    const link = await fetch(`${baseUrl}/api/admin/invite-purchases/${orderId}/claim-link`, {
      method: "POST",
      headers: { Authorization: `Bearer ${signAuth(await newUser("ops_notified"))}` },
    });
    const url = new URL((await link.json()).data.url);

    const res = await fetch(
      `${baseUrl}/api/invite-purchases/status/${orderId}?token=${url.searchParams.get("token")}`,
    );
    assert.equal(res.status, 200);
    const data = (await res.json()).data;
    assert.ok("codesNotifiedAt" in data, "the field has to exist to be relied on");
    assert.equal(data.codesNotifiedAt, null, "no confirmed send means it stays null");
    assert.equal(data.codes.length, 1);
  });

  test("the admin claim link needs invites.manage and a live order", async () => {
    const orderId = await newOrder({ userId: null, quantity: 1 });
    await fulfillInvitePurchase(orderId);

    // A role that grants nothing at all -> refused. (roleId is non-nullable, so
    // "unprivileged" has to be a real role rather than no role.)
    const powerless = await prisma.role.create({
      data: { name: "InvPay Powerless", slug: `${ROLE_SLUG}_none`, permissions: [] },
    });
    roleIds.push(powerless.id);
    const stranger = await newUser("ops_stranger", { roleId: powerless.id });
    const denied = await fetch(`${baseUrl}/api/admin/invite-purchases/${orderId}/claim-link`, {
      method: "POST",
      headers: { Authorization: `Bearer ${signAuth(stranger)}` },
    });
    assert.equal(denied.status, 403);

    const missing = await fetch(
      `${baseUrl}/api/admin/invite-purchases/${INVITE_PURCHASE_PREFIX}missing/claim-link`,
      { method: "POST", headers: { Authorization: `Bearer ${signAuth(await newUser("ops_missing"))}` } },
    );
    assert.equal(missing.status, 404);

    // Refunded: there is nothing left to claim, so do not mint a link for it.
    await refundInvitePurchase(orderId);
    const closed = await fetch(`${baseUrl}/api/admin/invite-purchases/${orderId}/claim-link`, {
      method: "POST",
      headers: { Authorization: `Bearer ${signAuth(await newUser("ops_refunded"))}` },
    });
    assert.equal(closed.status, 409);
  });

  test("the resellable list excludes purchased codes", async () => {
    const userId = await newUser("resell");
    const orderId = await newOrder({ userId, quantity: 1 });
    await fulfillInvitePurchase(orderId);
    const grant = await prisma.inviteCreditGrant.findFirst({ where: { orderId } });
    await prisma.inviteCode.createMany({
      data: [
        {
          code: `${Math.random().toString(16).slice(2, 18)}`,
          createdById: userId,
          purchased: true,
          purchasedAt: new Date(),
          sourceGrantId: grant!.id,
          fromAllowance: true,
        },
        {
          code: `${Math.random().toString(16).slice(2, 18)}`,
          createdById: userId,
          purchased: false,
          fromAllowance: false,
        },
      ],
    });

    const res = await fetch(`${baseUrl}/api/invite-purchases/resellable`, {
      headers: { Authorization: `Bearer ${signAuth(userId)}` },
    });
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.data.codes.length, 1);
    // Purchased codes are the ones the resale clause restricts, so they are not
    // in the set the member is free to deal with.
    assert.equal(body.data.codes[0].purchased, undefined);
  });

test("an admin can confirm a manual purchase by hand", async () => {
    const buyer = await newUser("manual_buyer");
    // A MANUAL order is only sellable while the operator has published where to pay,
    // so the instructions are part of the precondition rather than an extra.
    await setContactConfig("email", "pay@example.test");
    const res = await fetch(`${baseUrl}/api/invite-purchases`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${signAuth(buyer)}` },
      body: JSON.stringify({ quantity: 1, method: "MANUAL" }),
    });
    assert.equal(res.status, 201);
    const created = (await res.json()).data;
    assert.equal(created.status, "PENDING");

    const confirm = await fetch(`${baseUrl}/api/admin/invite-purchases/${created.id}/confirm`, {
      method: "POST",
      headers: { Authorization: `Bearer ${signAuth(buyer)}` },
    });
    assert.equal(confirm.status, 200);
    assert.equal((await confirm.json()).data.credited, true);

    const user = await prisma.user.findUnique({ where: { id: buyer }, select: { inviteAllowance: true } });
    assert.equal(user?.inviteAllowance, 1);
    await setContactConfig("none", "");
  });

  test("the storefront publishes the pay-by-hand instructions buyers need", async () => {
    await setContactConfig("telegram", "@operator");
    try {
      const body = await (await fetch(`${baseUrl}/api/invite-purchases/config`)).json();
      assert.deepEqual(body.data.manualPayment, {
        method: "telegram",
        value: "@operator",
        configured: true,
      });
    } finally {
      await setContactConfig("none", "");
    }
  });

  test("no instructions means the manual payment option is not offered", async () => {
    // A method chosen with no value leaves the buyer with nowhere to send money,
    // so the storefront must not claim the option exists.
    await setContactConfig("email", "");
    try {
      const body = await (await fetch(`${baseUrl}/api/invite-purchases/config`)).json();
      assert.equal(body.data.manualPayment.configured, false);
    } finally {
      await setContactConfig("none", "");
    }
  });

  test("a manual order is refused outright when nothing is published", async () => {
    // The storefront hides the option in this state; the API has to refuse it too,
    // or a crafted request could create a PENDING order that nobody can pay.
    await setContactConfig("email", "");
    try {
      const res = await fetch(`${baseUrl}/api/invite-purchases`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantity: 1, method: "MANUAL", email: "manual_unpayable@e2e.test" }),
      });
      assert.equal(res.status, 400);
      // No orphan order is left behind for the operator to refund.
      assert.equal(
        await prisma.invitePurchaseOrder.count({
          where: { buyerEmail: "manual_unpayable@e2e.test" },
        }),
        0,
      );
    } finally {
      await setContactConfig("none", "");
    }
  });

  test("a manual order is accepted once the instructions are published", async () => {
    await setContactConfig("telegram", "@operator");
    try {
      const res = await fetch(`${baseUrl}/api/invite-purchases`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantity: 1, method: "MANUAL", email: "manual_payable@e2e.test" }),
      });
      assert.equal(res.status, 201);
      const orderId = (await res.json()).data.id as string;
      await prisma.invitePurchaseOrder.delete({ where: { id: orderId } });
    } finally {
      await setContactConfig("none", "");
    }
  });

  test("resale 'permitted' sells without prohibiting, and the Terms follow it", async () => {
    await setInviteResaleMode("permitted");
    try {
      const store = await (await fetch(`${baseUrl}/api/invite-purchases/config`)).json();
      assert.equal(store.data.resale.clause, "permitted");
      // A permission must not be reported as a prohibition anywhere.
      assert.equal(store.data.resale.sellingAllowed, true);
      assert.equal(store.data.resale.enforcementActive, false);

      const policy = await (await fetch(`${baseUrl}/api/policy/context`)).json();
      assert.equal(policy.data.invites.resalePermitted, true);
      assert.equal(policy.data.invites.resaleRestricted, false);

      const member = await newUser("permitted_seller");
      const codes = await (
        await fetch(`${baseUrl}/api/invite-purchases/resellable`, {
          headers: { Authorization: `Bearer ${signAuth(member)}` },
        })
      ).json();
      assert.equal(codes.data.sellingAllowed, true);
    } finally {
      await setInviteResaleMode("off");
      await clearPolicyContextCache();
    }
  });

  test("resale 'off' stays silent while 'legal' prohibits", async () => {
    // `off` and `permitted` both allow selling; they differ only in publication.
    const off = await (await fetch(`${baseUrl}/api/policy/context`)).json();
    assert.equal(off.data.invites.resalePermitted, false);
    assert.equal(off.data.invites.resaleRestricted, false);

    await setInviteResaleMode("legal");
    // The admin route invalidates this on write; these tests call the library
    // directly, so they have to drop the snapshot themselves.
    await clearPolicyContextCache();
    try {
      const legal = await (await fetch(`${baseUrl}/api/policy/context`)).json();
      assert.equal(legal.data.invites.resaleRestricted, true);
      assert.equal(legal.data.invites.resalePermitted, false);
    } finally {
      await setInviteResaleMode("off");
      await clearPolicyContextCache();
    }
  });

  test("the admin accepts the new resale mode", async () => {
    const admin = await adminToken();
    const res = await fetch(`${baseUrl}/api/admin/invite-purchase-settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${admin}` },
      body: JSON.stringify({ purchaseEnabled: true, resaleMode: "permitted" }),
    });
    assert.equal(res.status, 200);
    const policy = await (await fetch(`${baseUrl}/api/policy/context`)).json();
    assert.equal(policy.data.invites.resaleMode, "permitted");
    await setInviteResaleMode("off");
    await clearPolicyContextCache();
  });

  test("an unknown resale mode is rejected rather than coerced", async () => {
    const admin = await adminToken();
    const res = await fetch(`${baseUrl}/api/admin/invite-purchase-settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${admin}` },
      body: JSON.stringify({ purchaseEnabled: true, resaleMode: "anything_goes" }),
    });
    assert.equal(res.status, 400);
  });

  test("the policy context reports the invite switches", async () => {
    const res = await fetch(`${baseUrl}/api/policy/context`);
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(typeof body.data.invites.purchaseEnabled, "boolean");
    assert.ok(["off", "permitted", "legal", "enforced"].includes(body.data.invites.resaleMode));
  });

  // --------------------------------------------------------- generation route

  test("a legacy balance with no ledger rows can still generate codes", async () => {
    // The ledger was added without backfilling grants, so a pre-existing counter
    // is all some accounts have. Generation must not silently return zero.
    const userId = await newUser("legacy_balance", {
      inviteAllowance: 2,
      inviteAllowanceExpiresAt: new Date(Date.now() + 30 * 86400000),
    });
    assert.equal(await prisma.inviteCreditGrant.count({ where: { userId } }), 0);

    const res = await fetch(`${baseUrl}/api/invites`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${signAuth(userId)}` },
      body: JSON.stringify({ count: 2 }),
    });
    assert.equal(res.status, 201);

    const codes = await prisma.inviteCode.findMany({ where: { createdById: userId } });
    assert.equal(codes.length, 2);
    // Nothing in the ledger paid for these, so they must not claim to be purchased.
    assert.equal(codes.every((c) => c.purchased === false), true);
    assert.equal(codes.every((c) => c.sourceGrantId === null), true);

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { inviteAllowance: true } });
    assert.equal(user?.inviteAllowance, 0, "the counter still drains");
  });

  test("a banned account generates purchased codes and nothing else", async () => {
    const userId = await newUser("banned_generate", { inviteBanned: true });
    const orderId = await newOrder({ userId, quantity: 2 });
    await fulfillInvitePurchase(orderId);
    const grant = await prisma.inviteCreditGrant.findFirst({ where: { orderId } });
    // An event grant the ban should not be able to draw on.
    await prisma.inviteCreditGrant.create({
      data: { userId, source: "EVENT", quantity: 5, expiresAt: null },
    });
    // The ban policy is what the admin/CLI ban path applies.
    const policy = await applyInviteBanPolicy(userId);
    await prisma.user.update({ where: { id: userId }, data: policy });

    const res = await fetch(`${baseUrl}/api/invites`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${signAuth(userId)}` },
      body: JSON.stringify({ count: 1 }),
    });
    assert.equal(res.status, 201);

    const codes = await prisma.inviteCode.findMany({ where: { createdById: userId } });
    assert.equal(codes.length, 1);
    assert.equal(codes[0].purchased, true);
    assert.equal(codes[0].sourceGrantId, grant!.id, "the code is attributable to the purchase");
  });

  test("a banned account with no purchased credits cannot generate", async () => {
    const userId = await newUser("banned_empty", { inviteBanned: true });
    await prisma.inviteCreditGrant.create({
      data: { userId, source: "EVENT", quantity: 5, expiresAt: null },
    });

    const res = await fetch(`${baseUrl}/api/invites`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${signAuth(userId)}` },
      body: JSON.stringify({ count: 1 }),
    });
    assert.equal(res.status, 403);
    assert.equal(await prisma.inviteCode.count({ where: { createdById: userId } }), 0);
  });

  test("a banned account cannot spend earned credits it still holds on the counter", async () => {
    // Defence in depth: even if a ban left an event balance on the counter, the
    // allocator refuses event grants rather than trusting the counter.
    const userId = await newUser("banned_counter_leak", { inviteBanned: true, inviteAllowance: 5 });
    await prisma.inviteCreditGrant.create({
      data: { userId, source: "EVENT", quantity: 5, expiresAt: null },
    });

    const res = await fetch(`${baseUrl}/api/invites`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${signAuth(userId)}` },
      body: JSON.stringify({ count: 1 }),
    });
    assert.equal(res.status, 403);
    assert.equal(await prisma.inviteCode.count({ where: { createdById: userId } }), 0);
  });
});