import { type Prisma, type PrismaClient } from "@prisma/client";
import { createHash } from "node:crypto";
import { prisma } from "./prisma.js";
import { getEnv } from "../config/env.js";
import { isIpAbuseWhitelisted } from "./antiAbuseWhitelist.js";

type Db = Prisma.TransactionClient | PrismaClient;

const DAY_MS = 86400000;

export interface ClaimFingerprint {
  ip: string;
  cookie: string;
  userAgent: string;
}

export type AbuseAction = "reject" | "skip" | "warn";
export type AbuseScope = "referrals" | "invites" | "both";

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function fingerprintHashes(fingerprint: ClaimFingerprint): {
  ip: string;
  cookie: string;
  userAgentHash: string;
} {
  return {
    ip: fingerprint.ip,
    cookie: fingerprint.cookie,
    userAgentHash: sha256(fingerprint.userAgent),
  };
}

export interface AffiliateLevel {
  level: number;
  value: string;
}

export function parseAffiliateLevels(raw: string): AffiliateLevel[] {
  if (!raw.trim()) return [];
  const levels: AffiliateLevel[] = [];
  for (const part of raw.split(",")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const sep = trimmed.indexOf(":");
    if (sep === -1) continue;
    const level = Number(trimmed.slice(0, sep));
    const value = trimmed.slice(sep + 1).trim();
    if (!Number.isInteger(level) || level < 1 || value === "") continue;
    levels.push({ level, value });
  }
  return levels.sort((a, b) => a.level - b.level);
}

export function discountLevels(): AffiliateLevel[] {
  return parseAffiliateLevels(getEnv().AFFILIATE_DISCOUNT_LEVELS);
}

export function allowanceLevels(): AffiliateLevel[] {
  return parseAffiliateLevels(getEnv().AFFILIATE_ALLOWANCE_LEVELS);
}

export function badgeLevels(): AffiliateLevel[] {
  return parseAffiliateLevels(getEnv().AFFILIATE_BADGE_LEVELS);
}

export const AFFILIATE_MILESTONES_SETTING_KEY = "affiliate.milestones";

export interface MilestoneConfig {
  discountLevels: AffiliateLevel[];
  allowanceLevels: AffiliateLevel[];
  badgeLevels: AffiliateLevel[];
  inviteeDiscountPercent?: number;
  discountDurationDays?: number;
}

export type MilestoneSource = "env" | "db";

function baseMilestoneConfig(): MilestoneConfig {
  return {
    discountLevels: discountLevels(),
    allowanceLevels: allowanceLevels(),
    badgeLevels: badgeLevels(),
  };
}

export function parseMilestoneConfigJson(raw: string | null | undefined): MilestoneConfig | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const asRecord = parsed as Record<string, unknown>;
  const bad = (v: unknown): v is AffiliateLevel[] =>
    Array.isArray(v) &&
    v.every(
      (e) =>
        typeof e === "object" &&
        e !== null &&
        Number.isInteger((e as AffiliateLevel).level) &&
        (e as AffiliateLevel).level >= 1 &&
        typeof (e as AffiliateLevel).value === "string" &&
        (e as AffiliateLevel).value.length > 0
    );
  const pick = (key: string): AffiliateLevel[] => {
    const v = asRecord[key];
    if (!bad(v)) return [];
    return (v as AffiliateLevel[])
      .map((l) => ({ level: l.level, value: l.value.trim() }))
      .sort((a, b) => a.level - b.level);
  };
  const maybeInt = (key: string): number | null => {
    const v = asRecord[key];
    return typeof v === "number" && Number.isInteger(v) ? v : null;
  };
  const inviteeDiscountPercent = maybeInt("inviteeDiscountPercent");
  const discountDurationDays = maybeInt("discountDurationDays");
  return {
    discountLevels: pick("discountLevels"),
    allowanceLevels: pick("allowanceLevels"),
    badgeLevels: pick("badgeLevels"),
    ...(inviteeDiscountPercent !== null ? { inviteeDiscountPercent } : {}),
    ...(discountDurationDays !== null ? { discountDurationDays } : {}),
  };
}

export async function effectiveMilestoneConfig(
  db: Db = prisma
): Promise<{ source: MilestoneSource; config: MilestoneConfig }> {
  const setting = await db.systemSetting.findUnique({ where: { key: AFFILIATE_MILESTONES_SETTING_KEY } });
  if (!setting?.value) return { source: "env", config: baseMilestoneConfig() };
  const parsed = parseMilestoneConfigJson(setting.value);
  if (!parsed) return { source: "env", config: baseMilestoneConfig() };
  return { source: "db", config: parsed };
}

export function resolveInviteeConfig(config: MilestoneConfig): {
  inviteeDiscountPercent: number;
  discountDurationDays: number;
} {
  const env = getEnv();
  return {
    inviteeDiscountPercent: config.inviteeDiscountPercent ?? env.AFFILIATE_INVITEE_DISCOUNT_PERCENT,
    discountDurationDays: config.discountDurationDays ?? env.AFFILIATE_DISCOUNT_DURATION_DAYS,
  };
}

export async function setAffiliateMilestones(config: MilestoneConfig): Promise<void> {
  const clean: MilestoneConfig = {
    discountLevels: config.discountLevels.map((l) => ({ level: l.level, value: String(l.value) })).sort((a, b) => a.level - b.level),
    allowanceLevels: config.allowanceLevels.map((l) => ({ level: l.level, value: String(l.value) })).sort((a, b) => a.level - b.level),
    badgeLevels: config.badgeLevels.map((l) => ({ level: l.level, value: String(l.value) })).sort((a, b) => a.level - b.level),
  };
  if (config.inviteeDiscountPercent !== undefined && config.inviteeDiscountPercent !== null) {
    clean.inviteeDiscountPercent = config.inviteeDiscountPercent;
  }
  if (config.discountDurationDays !== undefined && config.discountDurationDays !== null) {
    clean.discountDurationDays = config.discountDurationDays;
  }
  await prisma.systemSetting.upsert({
    where: { key: AFFILIATE_MILESTONES_SETTING_KEY },
    update: { value: JSON.stringify(clean) },
    create: { key: AFFILIATE_MILESTONES_SETTING_KEY, value: JSON.stringify(clean) },
  });
}

export async function resetAffiliateMilestones(): Promise<void> {
  await prisma.systemSetting.deleteMany({ where: { key: AFFILIATE_MILESTONES_SETTING_KEY } });
}

export async function countReferrals(userId: string, db: Db = prisma): Promise<number> {
  return db.inviteCode.count({
    where: { createdById: userId, usedById: { not: null } },
  });
}

function discountExpiry(days: number): Date | null {
  if (days < 0) return null;
  return new Date(Date.now() + days * DAY_MS);
}

export async function applyInviteeDiscount(userId: string, db: Db = prisma): Promise<void> {
  const { config } = await effectiveMilestoneConfig(db);
  const { inviteeDiscountPercent, discountDurationDays } = resolveInviteeConfig(config);
  if (inviteeDiscountPercent <= 0) return;
  await db.user.update({
    where: { id: userId },
    data: {
      discountPercent: Math.max(0, inviteeDiscountPercent),
      discountExpiresAt: discountExpiry(discountDurationDays),
    },
  });
}

export async function applyReferrerRewards(userId: string, db: Db = prisma): Promise<void> {
  const count = await countReferrals(userId, db);
  const { config } = await effectiveMilestoneConfig(db);
  const { discountDurationDays } = resolveInviteeConfig(config);

  const discounts = config.discountLevels.filter((l) => l.level <= count);
  const allowances = config.allowanceLevels.filter((l) => l.level <= count);
  const badges = config.badgeLevels.filter((l) => l.level <= count);

  if (discounts.length > 0) {
    const best = discounts[discounts.length - 1];
    const seen = await db.affiliateReward.findMany({
      where: { userId, kind: "discount" },
      select: { level: true },
    });
    const seenLevels = new Set(seen.map((r) => r.level));
    const granted = await db.affiliateReward.createMany({
      data: discounts
        .filter((l) => !seenLevels.has(l.level))
        .map((l) => ({ userId, kind: "discount", value: l.value, level: l.level })),
      skipDuplicates: true,
    });
    if (granted.count > 0) {
      await db.user.update({
        where: { id: userId },
        data: {
          discountPercent: Math.max(0, Number(best.value) || 0),
          discountExpiresAt: discountExpiry(discountDurationDays),
        },
      });
    }
  }

  if (allowances.length > 0) {
    const seen = await db.affiliateReward.findMany({
      where: { userId, kind: "allowance" },
      select: { level: true },
    });
    const seenLevels = new Set(seen.map((r) => r.level));
    const granted = await db.affiliateReward.createMany({
      data: allowances
        .filter((l) => !seenLevels.has(l.level))
        .map((l) => ({ userId, kind: "allowance", value: l.value, level: l.level })),
      skipDuplicates: true,
    });
    if (granted.count > 0) {
      const extra = allowances
        .filter((l) => !seenLevels.has(l.level))
        .reduce((sum, l) => sum + (Number(l.value) || 0), 0);
      if (extra > 0) {
        await db.user.update({
          where: { id: userId },
          data: { inviteAllowance: { increment: extra } },
        });
      }
    }
  }

  if (badges.length > 0) {
    const seen = await db.affiliateReward.findMany({
      where: { userId, kind: "badge" },
      select: { level: true },
    });
    const seenLevels = new Set(seen.map((r) => r.level));
    const newBadges = badges.filter((l) => !seenLevels.has(l.level));
    for (const l of newBadges) {
      const badge = await db.badge.findUnique({ where: { slug: l.value } });
      if (!badge) continue;
      await db.affiliateReward.create({
        data: { userId, kind: "badge", value: l.value, level: l.level, ref: badge.id },
      });
      await db.user.update({
        where: { id: userId },
        data: { badges: { connect: { id: badge.id } } },
      });
    }
  }
}

export async function ensureReferralEdge(
  inviteeId: string,
  referrerId: string | undefined | null,
  db: Db = prisma
): Promise<void> {
  if (!referrerId || referrerId === inviteeId) return;
  await db.user.update({
    where: { id: inviteeId },
    data: { referredById: referrerId },
  });
  await applyReferrerRewards(referrerId, db);
}

export async function nextMilestone(userId: string): Promise<AffiliateLevel | null> {
  const count = await countReferrals(userId);
  const { config } = await effectiveMilestoneConfig();
  const candidates = [
    ...config.discountLevels,
    ...config.allowanceLevels,
    ...config.badgeLevels,
  ].sort((a, b) => a.level - b.level);
  for (const l of candidates) {
    if (l.level > count) return l;
  }
  return null;
}

function fingerprintFilter(fingerprint: ClaimFingerprint) {
  const { ip, cookie, userAgentHash } = fingerprintHashes(fingerprint);
  return {
    OR: [
      { registeredIp: ip },
      { registeredFingerprint: cookie },
      { registeredUserAgentHash: userAgentHash },
    ],
  } satisfies Prisma.UserWhereInput;
}

export async function detectInviteAbuse(
  db: Db,
  fingerprint: ClaimFingerprint,
  referrerId: string | null,
): Promise<{ action: AbuseAction; reason: "referral" | "invite" } | null> {
  if (!fingerprint.ip && !fingerprint.cookie) return null;

  if (fingerprint.ip && (await isIpAbuseWhitelisted(fingerprint.ip, db))) return null;

  const env = getEnv();
  const scope = env.AFFILIATE_ABUSE_SCOPE;
  const action = env.AFFILIATE_ABUSE_ACTION;

  if (scope === "referrals" || scope === "both") {
    if (referrerId && (await db.user.findFirst({ where: { referredById: referrerId, ...fingerprintFilter(fingerprint) }, select: { id: true } }))) {
      return { action, reason: "referral" };
    }
  }

  if (scope === "invites" || scope === "both") {
    if (await db.user.findFirst({ where: { inviteUsed: { isNot: null }, ...fingerprintFilter(fingerprint) }, select: { id: true } })) {
      return { action, reason: "invite" };
    }
  }

  return null;
}