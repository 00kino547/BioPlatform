import { randomBytes } from "node:crypto";
import jwt from "jsonwebtoken";
import type { InviteDb } from "./inviteService.js";
import { grantInviteCredits } from "./inviteService.js";
import { prisma } from "./prisma.js";
import { getEnv } from "../config/env.js";
import { revokePurchasedGrantForOrder } from "./inviteService.js";

/**
 * Paid invite orders.
 *
 * A credit purchase is not a plan upgrade, so it cannot live in `Order` (whose
 * `plan` column is a `UserTier`). It gets its own table, `InvitePurchaseOrder`,
 * which deliberately mirrors `Order`'s money columns so the existing Stripe /
 * PayPal / crypto checkout helpers and webhook plumbing can be reused unchanged.
 *
 * `id` is text rather than a UUID so it can carry the `invites-` prefix that
 * `handleGatewayEvent` dispatches on, exactly like the existing `tip-` and
 * `purchase-` namespaces.
 */

/** Dispatch prefix for gateway metadata / webhook order ids. */
export const INVITE_PURCHASE_PREFIX = "invites-";

export function isInvitePurchaseOrderId(id: string): boolean {
  return id.startsWith(INVITE_PURCHASE_PREFIX);
}

/**
 * Invite codes are stored and returned in plaintext today, so a guest purchase
 * has to deliver them somehow. These are 128 bits from the same generator shape
 * the existing invite codes use (16 lowercase hex chars), so the two are
 * indistinguishable to anything scanning the column.
 */
export function generateInviteCode(): string {
  return randomBytes(8).toString("hex");
}

export interface InvitePurchaseSummary {
  id: string;
  quantity: number;
  priceCents: number;
  currency: string;
  status: string;
  method: string;
  createdAt: string;
}

/**
 * Guest claim token.
 *
 * Lets someone who bought credits before registering prove ownership of the
 * order later. Scoped to a single order id, so a leaked token cannot be walked
 * across purchases. Reuses `PRODUCT_PURCHASE_TOKEN_TTL_DAYS`, the same shelf-life
 * operators already configure for guest shop purchases.
 */
export function signInviteClaimToken(orderId: string, ttlDays: number): string {
  return jwt.sign({ purpose: "invite_claim", orderId }, getEnv().JWT_SECRET, {
    expiresIn: ttlDays * 86400,
  });
}

export function verifyInviteClaimToken(token: string): string | null {
  try {
    const payload = jwt.verify(token, getEnv().JWT_SECRET) as {
      purpose?: string;
      orderId?: string;
    };
    if (payload.purpose !== "invite_claim" || typeof payload.orderId !== "string") return null;
    return payload.orderId;
  } catch {
    return null;
  }
}

/** Public projection of a purchase, with no gateway or buyer internals. */
export function toPurchaseSummary(order: {
  id: string;
  quantity: number;
  priceCents: number;
  currency: string;
  status: string;
  method: string;
  createdAt: Date;
}): InvitePurchaseSummary {
  return {
    id: order.id,
    quantity: order.quantity,
    priceCents: order.priceCents,
    currency: order.currency,
    status: order.status,
    method: order.method,
    createdAt: order.createdAt.toISOString(),
  };
}

/**
 * Credits a paid order and mints its codes, atomically.
 *
 * Both halves happen in one transaction because they are the same promise to the
 * buyer: money taken means credits exist.
 *
 * Redelivery safety comes from the conditional `status: "PENDING"` update rather
 * than a unique constraint on the grant: a redelivered webhook finds zero rows to
 * claim and returns without crediting a second time.
 */
export async function fulfillInvitePurchase(
  orderId: string,
  opts: { transactionId?: string; gatewayStatus?: string } = {},
  db: InviteDb = prisma
): Promise<{ credited: boolean; quantity: number }> {
  const run = async (tx: InviteDb): Promise<{ credited: boolean; quantity: number }> => {
    const order = await tx.invitePurchaseOrder.findUnique({ where: { id: orderId } });
    if (!order) return { credited: false, quantity: 0 };

    // Idempotent: a gateway that redelivers a paid event must not double-credit.
    if (order.status === "PAID") return { credited: false, quantity: 0 };

    const claimed = await tx.invitePurchaseOrder.updateMany({
      where: { id: orderId, status: "PENDING" },
      data: {
        status: "PAID",
        paidAt: new Date(),
        ...(opts.transactionId ? { gatewayTransactionId: opts.transactionId } : {}),
        ...(opts.gatewayStatus ? { gatewayStatus: opts.gatewayStatus } : {}),
      },
    });
    if (claimed.count === 0) return { credited: false, quantity: 0 };

    // A guest has no account, so there is nothing to credit: the codes are the
    // product and are minted here instead. A member's credits land on their
    // balance as an ordinary perpetual grant.
    if (order.userId) {
      await grantInviteCredits(
        order.userId,
        { source: "PURCHASED", quantity: order.quantity, expiresAt: null, orderId },
        tx
      );
      return { credited: true, quantity: order.quantity };
    }

    // Bounded life, because unlike a member's perpetual credits these are real
    // codes sitting in the database with no account holding them.
    const expiresAt = new Date(Date.now() + getEnv().INVITE_PURCHASE_CODE_TTL_DAYS * 86400000);
    const codes = Array.from({ length: order.quantity }, () => ({
      code: generateInviteCode(),
      // No owner yet: the buyer has no account. The account created by redeeming
      // one of these adopts the rest (see `adoptGuestPurchaseCodes`).
      createdById: null,
      purchased: true,
      purchasedAt: new Date(),
      expiresAt,
      note: `invite purchase ${orderId}`,
    }));

    await tx.inviteCode.createMany({ data: codes });

    return { credited: true, quantity: order.quantity };
  };

  if ("$transaction" in db) {
    return (db as unknown as { $transaction: <T>(f: (tx: InviteDb) => Promise<T>) => Promise<T> }).$transaction(
      (tx) => run(tx as InviteDb)
    );
  }
  return run(db);
}

/**
 * Marks a paid invite purchase refunded and revokes what it produced.
 *
 * Codes the buyer already handed out and that were redeemed stay valid — the
 * person holding them has joined, and clawing that back would be hostile. Only
 * unspent purchased artefacts are pulled.
 */
export async function refundInvitePurchase(
  orderId: string,
  opts: { transactionId?: string; gatewayStatus?: string } = {},
  db: InviteDb = prisma
): Promise<boolean> {
  const run = async (tx: InviteDb): Promise<boolean> => {
    const order = await tx.invitePurchaseOrder.findUnique({ where: { id: orderId } });
    if (!order || order.status !== "PAID") return false;

    await tx.invitePurchaseOrder.update({
      where: { id: orderId },
      data: {
        status: "REFUNDED",
        refundedAt: new Date(),
        ...(opts.transactionId ? { gatewayTransactionId: opts.transactionId } : {}),
        ...(opts.gatewayStatus ? { gatewayStatus: opts.gatewayStatus } : {}),
      },
    });

    const now = new Date();
    if (order.userId) {
      // Scoped to *this* order's grants. Revoking by `createdById` + `purchased`
      // would pull codes paid for by a different, still-valid order.
      await revokePurchasedGrantForOrder(orderId, tx);
    } else {
      // Guest codes carry the order id in their note, which is the only link they
      // have to the order.
      await tx.inviteCode.updateMany({
        where: {
          note: `invite purchase ${orderId}`,
          purchased: true,
          usedAt: null,
          revokedAt: null,
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
        data: { revokedAt: now },
      });
    }
    return true;
  };

  if ("$transaction" in db) {
    return (db as unknown as { $transaction: <T>(f: (tx: InviteDb) => Promise<T>) => Promise<T> }).$transaction(
      (tx) => run(tx as InviteDb)
    );
  }
  return run(db);
}

export async function cancelInvitePurchase(
  orderId: string,
  opts: { transactionId?: string; gatewayStatus?: string } = {},
  db: InviteDb = prisma
): Promise<void> {
  await db.invitePurchaseOrder.updateMany({
    where: { id: orderId, status: "PENDING" },
    data: {
      status: "CANCELLED",
      ...(opts.transactionId ? { gatewayTransactionId: opts.transactionId } : {}),
      ...(opts.gatewayStatus ? { gatewayStatus: opts.gatewayStatus } : {}),
    },
  });
}

/**
 * Emails a guest buyer their codes, exactly once.
 *
 * A guest has no balance and no account page to return to, so the email *is* the
 * delivery. The `codesNotifiedAt` claim is taken with a conditional update before
 * the send: gateways redeliver paid events, and a second email would look like a
 * duplicate sale rather than a retry. Running after the fulfilment transaction has
 * committed also means the codes in the message are already durable.
 *
 * Returns false when there was nothing to do — a member purchase (credited to the
 * balance, nothing to mail), an order already notified, an order holding no live
 * codes, or a send that failed. A failed send is deliberately *not* recorded as
 * notified, so the next run can try again.
 */
export async function notifyGuestPurchaseCodes(orderId: string, db: InviteDb = prisma): Promise<boolean> {
  const order = await db.invitePurchaseOrder.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      userId: true,
      buyerEmail: true,
      status: true,
      quantity: true,
      codesNotifiedAt: true,
    },
  });
  if (!order || order.userId !== null || order.status !== "PAID" || order.codesNotifiedAt !== null) {
    return false;
  }

  const codes = await db.inviteCode.findMany({
    where: {
      note: `invite purchase ${order.id}`,
      purchased: true,
      usedAt: null,
      revokedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    select: { code: true },
    orderBy: { createdAt: "asc" },
  });
  if (codes.length === 0) return false;

  const token = signInviteClaimToken(order.id, getEnv().PRODUCT_PURCHASE_TOKEN_TTL_DAYS);
  const origin = getEnv().APP_URL.replace(/\/+$/, "");
  const link = `${origin}/invites/purchased/${encodeURIComponent(order.id)}?token=${encodeURIComponent(token)}`;
  const ttl = getEnv().INVITE_PURCHASE_CODE_TTL_DAYS;

  const list = codes.map((c) => `<li><code>${c.code}</code></li>`).join("");

  const { sendNewsletterEmail } = await import("./newsletter.js");

  // This email is the ONLY place the claim token exists: the guest has no account,
  // and the codes themselves are only redeemable by someone who reads the inbox.
  // So `codesNotifiedAt` is stamped after a confirmed send, never before. A
  // duplicate email after a crash is harmless; silently dropping paid codes on a
  // transient SMTP failure is not recoverable for the buyer.
  let sent = false;
  try {
    const result = await sendNewsletterEmail({
      to: order.buyerEmail,
      subject: `Your ${order.quantity} invite code${order.quantity === 1 ? "" : "s"}`,
      html:
        "<p>Thanks for buying invite credits. Here are your codes:</p>" +
        `<ul>${list}</ul>` +
        "<p>Use one code to register. Once you have an account, the remaining codes " +
        "are added to it automatically — you do not need to redeem them one by one.</p>" +
        `<p>These codes expire in ${ttl} days. <a href="${link}">View this purchase</a>.</p>`,
    });
    sent = result.success;
  } catch {
    // sendNewsletterEmail reports failures in its result, but a transport that
    // throws must not be allowed to mark the order as notified either.
    sent = false;
  }

  if (!sent) return false;

  await db.invitePurchaseOrder.updateMany({
    where: { id: orderId, codesNotifiedAt: null },
    data: { codesNotifiedAt: new Date() },
  });

  return true;
}

/** Extracts the order id a guest code belongs to, from its marker note. */
export function guestPurchaseOrderId(note: string | null): string | null {
  if (!note) return null;
  const match = /^invite purchase (invites-[a-z0-9]+)$/.exec(note);
  return match ? match[1] : null;
}

/**
 * Adopts an unclaimed guest purchase for a newly registered account.
 *
 * Registration is invite-only, so a buyer who has no account yet receives real
 * codes by email and redeems one to join. Whoever holds a valid guest code is, in
 * practice, the buyer — the codes went to their inbox and nowhere else — so
 * redeeming one hands them the rest automatically. That is what stops a purchase
 * from being paid for and then orphaned one code at a time.
 *
 * Runs inside the registration transaction: either the account and its adopted
 * codes both exist, or neither does.
 */
export async function adoptGuestPurchase(
  userId: string,
  orderId: string,
  db: InviteDb = prisma
): Promise<{ adopted: number; alreadyClaimed: boolean }> {
  const order = await db.invitePurchaseOrder.findUnique({ where: { id: orderId } });
  if (!order || order.status !== "PAID") return { adopted: 0, alreadyClaimed: true };
  // Single-use: a second registration must not be able to take the same purchase.
  if (order.claimedById !== null && order.claimedById !== userId) {
    return { adopted: 0, alreadyClaimed: true };
  }

  const now = new Date();
  const unspent = await db.inviteCode.findMany({
    where: { note: `invite purchase ${orderId}`, purchased: true, usedAt: null, revokedAt: null },
    select: { id: true },
  });

  if (unspent.length > 0) {
    // The marker note is cleared once the codes have a real owner, so the order
    // link is not left behind on rows that now belong to an account.
    await db.inviteCode.updateMany({
      where: { id: { in: unspent.map((c) => c.id) } },
      data: { createdById: userId, note: null },
    });
  }

  if (order.claimedById === null) {
    await db.invitePurchaseOrder.update({
      where: { id: orderId },
      data: { claimedById: userId, claimedAt: now },
    });
  }

  return { adopted: unspent.length, alreadyClaimed: false };
}