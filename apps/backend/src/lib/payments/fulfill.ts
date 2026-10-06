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
  await prisma.$transaction(async (tx) => {
    if (order.status !== "PENDING") return;
    if (TIER_RANK[order.plan] > TIER_RANK[order.user.tier]) {
      await tx.user.update({ where: { id: order.userId }, data: { tier: order.plan } });
      upgraded = true;
    }
    await tx.order.update({ where: { id: orderId }, data });
  });
  return { upgraded, tier: upgraded ? order.plan : order.user.tier };
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