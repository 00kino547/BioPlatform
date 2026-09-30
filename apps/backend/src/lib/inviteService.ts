import { type Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "./prisma.js";

export const DAY_MS = 86400000;

type Db = Prisma.TransactionClient | PrismaClient;

export const INVITE_GENERATION_SETTING_KEY = "invites.userGenerationEnabled";

export async function getInviteGenerationEnabled(): Promise<boolean> {
  const setting = await prisma.systemSetting.findUnique({
    where: { key: INVITE_GENERATION_SETTING_KEY },
  });
  return setting?.value === "true";
}

export async function setInviteGenerationEnabled(enabled: boolean): Promise<void> {
  await prisma.systemSetting.upsert({
    where: { key: INVITE_GENERATION_SETTING_KEY },
    update: { value: String(enabled) },
    create: { key: INVITE_GENERATION_SETTING_KEY, value: String(enabled) },
  });
}

export interface InviteAllowanceInfo {
  allowance: number;
  allowanceExpiresAt: Date | null;
  active: boolean;
}

export function computeInviteAllowance(user: {
  inviteAllowance: number;
  inviteAllowanceExpiresAt: Date | null;
}): InviteAllowanceInfo {
  const active =
    user.inviteAllowance > 0 &&
    (user.inviteAllowanceExpiresAt === null || user.inviteAllowanceExpiresAt > new Date());
  return {
    allowance: active ? user.inviteAllowance : 0,
    allowanceExpiresAt: user.inviteAllowanceExpiresAt,
    active,
  };
}

/**
 * Refunds one allowance credit for every invite the user generated from an
 * event allowance that expired unused *before* the allowance itself expires.
 * Credits that die exactly at the allowance expiry are not refunded.
 */
export async function runInviteRefundSweep(userId: string, db: Db = prisma): Promise<number> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { inviteAllowance: true, inviteAllowanceExpiresAt: true },
  });
  if (!user) return 0;

  const allowanceExpiresAt = user.inviteAllowanceExpiresAt;
  const allowanceActive =
    allowanceExpiresAt === null || allowanceExpiresAt > new Date();
  if (!allowanceActive) return 0;

  const now = new Date();
  const expiredCodes = await db.inviteCode.findMany({
    where: {
      createdById: userId,
      fromAllowance: true,
      usedAt: null,
      revokedAt: null,
      refundedAt: null,
      expiresAt: { not: null, lte: now },
    },
    select: { id: true, expiresAt: true },
  });

  const refundable =
    allowanceExpiresAt === null
      ? expiredCodes
      : expiredCodes.filter((c) => (c.expiresAt as Date) < allowanceExpiresAt);

  if (refundable.length === 0) return 0;

  const sweep = async (tx: Db): Promise<void> => {
    // Conditionally mark refunded with the same eligibility predicates re-checked
    // inside the UPDATE itself, and credit the allowance only for rows actually
    // transitioned. This closes the TOCTOU where two concurrent sweeps both read
    // the same expired codes and both increment the allowance: only one sweep
    // wins the `refundedAt: null` guard, so the grant is sized by the
    // affected-row count instead of a stale pre-read.
    const marked = await tx.inviteCode.updateMany({
      where: {
        id: { in: refundable.map((c) => c.id) },
        usedAt: null,
        revokedAt: null,
        refundedAt: null,
        expiresAt: { not: null, lte: now },
      },
      data: { refundedAt: now },
    });
    if (marked.count <= 0) return;
    await tx.user.update({
      where: { id: userId },
      data: { inviteAllowance: { increment: marked.count } },
    });
  };

  if ("$transaction" in db) {
    await (db as PrismaClient).$transaction(async (tx) => sweep(tx as unknown as Db));
  } else {
    await sweep(db);
  }

  return refundable.length;
}

export async function countOutstandingInvites(
  userId: string,
  fromAllowance?: boolean,
  db: Db = prisma
): Promise<number> {
  const now = new Date();
  return db.inviteCode.count({
    where: {
      createdById: userId,
      usedAt: null,
      revokedAt: null,
      ...(fromAllowance === undefined ? {} : { fromAllowance }),
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
  });
}

export async function countConsumedInvites(userId: string, db: Db = prisma): Promise<number> {
  return db.inviteCode.count({
    where: { createdById: userId, usedById: { not: null } },
  });
}

export async function hasPaidOrder(userId: string, db: Db = prisma): Promise<boolean> {
  const order = await db.order.findFirst({
    where: { userId, plan: "ENTERPRISE", status: "PAID" },
    select: { id: true },
  });
  return order !== null;
}

export interface SeatInfo {
  limited: boolean;
  limit: number;
  used: number;
  remaining: number;
}

/**
 * Enterprise seat limit for gifted ENTERPRISE accounts.
 * A limit is enforced only when the user is ENTERPRISE, the admin has set a
 * positive seatLimit, and the account has never paid for ENTERPRISE (a paid
 * order means the tier was earned through billing, not gifted).
 */
export async function computeSeatInfo(
  userId: string,
  user: { tier: string; seatLimit: number | null },
  db: Db = prisma
): Promise<SeatInfo> {
  const limited =
    user.tier === "ENTERPRISE" && user.seatLimit !== null && user.seatLimit > 0
      ? !(await hasPaidOrder(userId, db))
      : false;
  if (!limited) {
    return { limited: false, limit: 0, used: 0, remaining: Number.MAX_SAFE_INTEGER };
  }
  const used = await countConsumedInvites(userId, db);
  const limit = user.seatLimit as number;
  return { limited: true, limit, used, remaining: Math.max(0, limit - used) };
}

export interface RoleInviteConfig {
  batchLimit: number;
  outstandingLimit: number;
  cooldownMinutes: number;
  defaultExpiryDays: number;
  minExpiryDays: number;
  maxExpiryDays: number;
}

export function roleInviteConfig(role: {
  inviteBatchLimit: number;
  inviteOutstandingLimit: number;
  inviteCooldownMinutes: number;
  inviteDefaultExpiryDays: number;
  inviteMinExpiryDays: number;
  inviteMaxExpiryDays: number;
}): RoleInviteConfig {
  return {
    batchLimit: role.inviteBatchLimit,
    outstandingLimit: role.inviteOutstandingLimit,
    cooldownMinutes: role.inviteCooldownMinutes,
    defaultExpiryDays: role.inviteDefaultExpiryDays,
    minExpiryDays: role.inviteMinExpiryDays,
    maxExpiryDays: role.inviteMaxExpiryDays,
  };
}
