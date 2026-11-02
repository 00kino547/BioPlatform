import { prisma } from "../prisma.js";

const TIER_RANK: Record<string, number> = { FREE: 0, PRO: 1, ENTERPRISE: 2 };

export function tierRanks(): Record<string, number> {
  return { ...TIER_RANK };
}

/**
 * Marks an order PAID and upgrades the buyer's tier to the ordered plan when it
 * is higher than their current one. Idempotent: a PENDING order is the only
 * state that transitions; already-PAID orders are left untouched.
 */
export async function fulfillOrderAsPaid(
  orderId: string,
  opts: { transactionId?: string; gatewayStatus?: string },
): Promise<{ upgraded: boolean; tier: string }> {
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { user: { select: { tier: true } } } });
  if (!order) return { upgraded: false, tier: "" };
  if (order.status === "PAID") return { upgraded: false, tier: order.user.tier };
  if (order.status !== "PENDING") return { upgraded: false, tier: order.user.tier };

  const data: Record<string, unknown> = { status: "PAID", paidAt: new Date() };
  if (opts.transactionId) data.gatewayTransactionId = opts.transactionId;
  if (opts.gatewayStatus) data.gatewayStatus = opts.gatewayStatus;

  let upgraded = false;
  let finalTier = order.user.tier;
  await prisma.$transaction(async (tx) => {
    const res = await tx.order.updateMany({ where: { id: orderId, status: "PENDING" }, data });
    if (res.count === 0) {
      // Lost the PENDING claim: a webhook redelivery or a concurrent
      // fulfilment already moved the order. Keep the caller's tier answer
      // consistent with what actually committed instead of the stale pre-read.
      const current = await tx.order.findUnique({ where: { id: orderId }, include: { user: { select: { tier: true } } } });
      if (current) finalTier = current.user.tier;
      return;
    }
    // Claim won: re-read inside the transaction so the tier bump is decided
    // against the row as committed, not the stale pre-read snapshot.
    const fresh = await tx.order.findUnique({ where: { id: orderId }, include: { user: { select: { tier: true } } } });
    if (!fresh) return;
    if (TIER_RANK[fresh.plan] > TIER_RANK[fresh.user.tier]) {
      await tx.user.update({ where: { id: fresh.userId }, data: { tier: fresh.plan } });
      upgraded = true;
      finalTier = fresh.plan;
    } else {
      finalTier = fresh.user.tier;
    }
  });
  return { upgraded, tier: finalTier };
}

export async function markOrderCancelled(
  orderId: string,
  opts: { transactionId?: string; gatewayStatus?: string },
): Promise<void> {
  const data: Record<string, unknown> = { status: "CANCELLED" };
  if (opts.transactionId) data.gatewayTransactionId = opts.transactionId;
  if (opts.gatewayStatus) data.gatewayStatus = opts.gatewayStatus;
  await prisma.order.updateMany({ where: { id: orderId, status: "PENDING" }, data });
}

export async function markOrderRefunded(
  orderId: string,
  opts: { transactionId?: string; gatewayStatus?: string },
): Promise<void> {
  const data: Record<string, unknown> = { status: "REFUNDED" };
  if (opts.transactionId) data.gatewayTransactionId = opts.transactionId;
  if (opts.gatewayStatus) data.gatewayStatus = opts.gatewayStatus;
  await prisma.order.updateMany({ where: { id: orderId, status: "PAID" }, data });
}