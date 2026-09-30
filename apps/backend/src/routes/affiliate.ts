import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { requirePermission } from "../middleware/admin.js";
import { PERMISSIONS } from "../lib/permissions.js";
import { getEnv } from "../config/env.js";
import {
  countReferrals,
  nextMilestone,
  effectiveMilestoneConfig,
  resolveInviteeConfig,
  setAffiliateMilestones,
  resetAffiliateMilestones,
  type AffiliateLevel,
  type MilestoneConfig,
} from "../lib/affiliateService.js";

const router = Router();

router.get("/me", requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.userId! },
    include: {
      referredBy: { select: { id: true, username: true } },
      affiliateRewards: { orderBy: { level: "asc" } },
    },
  });
  if (!user) {
    return res.status(401).json({ success: false, error: "Unauthorized" });
  }

  const referralCount = await countReferrals(user.id);
  const env = getEnv();
  const { config } = await effectiveMilestoneConfig();
  const inviteeConfig = resolveInviteeConfig(config);
  const rewards = user.affiliateRewards.map((r) => ({
    kind: r.kind,
    value: r.value,
    level: r.level,
    createdAt: r.createdAt,
  }));

  res.json({
    success: true,
    data: {
      referralCount,
      discountPercent: user.discountPercent,
      discountExpiresAt: user.discountExpiresAt,
      referredBy: user.referredBy,
      nextMilestone: await nextMilestone(user.id),
      rewards,
      config: {
        inviteeDiscountPercent: inviteeConfig.inviteeDiscountPercent,
        discountDurationDays: inviteeConfig.discountDurationDays,
        discountLevels: config.discountLevels,
        allowanceLevels: config.allowanceLevels,
        badgeLevels: config.badgeLevels,
        abuseAction: env.AFFILIATE_ABUSE_ACTION,
        abuseScope: env.AFFILIATE_ABUSE_SCOPE,
      },
    },
  });
});

router.get("/admin/overview", requireAuth, requirePermission(PERMISSIONS.AFFILIATES_MANAGE), async (_req, res) => {
  const env = getEnv();

  const leaderboard = await prisma.inviteCode.groupBy({
    by: ["createdById"],
    where: { usedById: { not: null } },
    _count: { _all: true },
  });
  leaderboard.sort((a, b) => b._count._all - a._count._all);
  const top = leaderboard.slice(0, 50);

  const withUsers = await Promise.all(
    top.map(async (row) => {
      const u = await prisma.user.findUnique({
        where: { id: row.createdById },
        select: {
          id: true,
          username: true,
          tier: true,
          discountPercent: true,
          discountExpiresAt: true,
          _count: { select: { referrals: true } },
        },
      });
      return u ? { ...u, referralCount: row._count._all } : null;
    })
  );

  const { source, config } = await effectiveMilestoneConfig();
  const inviteeConfig = resolveInviteeConfig(config);

  res.json({
    success: true,
    data: {
      leaderboard: withUsers.filter((u): u is NonNullable<typeof u> => u !== null),
      totalReferrals: top.reduce((sum, r) => sum + r._count._all, 0),
      distinctReferrers: top.length,
      configSource: source,
      config: {
        inviteeDiscountPercent: inviteeConfig.inviteeDiscountPercent,
        discountDurationDays: inviteeConfig.discountDurationDays,
        discountLevels: config.discountLevels,
        allowanceLevels: config.allowanceLevels,
        badgeLevels: config.badgeLevels,
        abuseAction: env.AFFILIATE_ABUSE_ACTION,
        abuseScope: env.AFFILIATE_ABUSE_SCOPE,
      },
    },
  });
});

const levelSchema = z.object({
  level: z.number().int().min(1).max(9999),
  value: z.string().trim().min(1).max(32),
});

const adminConfigSchema = z
  .object({
    discountLevels: z.array(levelSchema).max(100).default([]),
    allowanceLevels: z.array(levelSchema).max(100).default([]),
    badgeLevels: z.array(levelSchema).max(100).default([]),
    inviteeDiscountPercent: z.number().int().min(0).max(100).nullable().optional(),
    discountDurationDays: z.number().int().min(-1).max(3650).nullable().optional(),
  })
  .strict();

function sortLevels(levels: AffiliateLevel[]): AffiliateLevel[] {
  return [...levels].sort((a, b) => a.level - b.level);
}

async function validateAdminConfig(
  parsed: MilestoneConfig
): Promise<{ ok: true } | { ok: false; error: string }> {
  for (const level of parsed.discountLevels) {
    const pct = Number(level.value);
    if (!Number.isInteger(pct) || pct < 1 || pct > 99) {
      return { ok: false, error: `Discount at level ${level.level} must be an integer percent 1-99` };
    }
  }
  for (const level of parsed.allowanceLevels) {
    const count = Number(level.value);
    if (!Number.isInteger(count) || count < 1 || count > 9999) {
      return { ok: false, error: `Allowance at level ${level.level} must be an invite count 1-9999` };
    }
  }
  const uniqueLevels =
    (new Set(parsed.discountLevels.map((l) => l.level)).size === parsed.discountLevels.length) &&
    (new Set(parsed.allowanceLevels.map((l) => l.level)).size === parsed.allowanceLevels.length) &&
    (new Set(parsed.badgeLevels.map((l) => l.level)).size === parsed.badgeLevels.length);
  if (!uniqueLevels) {
    return { ok: false, error: "Level numbers must be unique within each reward type" };
  }
  for (const level of parsed.badgeLevels) {
    const badge = await prisma.badge.findUnique({ where: { slug: level.value } });
    if (!badge) {
      return { ok: false, error: `Badge "\\"${level.value}\\" (level ${level.level}) does not exist` };
    }
  }
  return { ok: true };
}

router.put("/admin/config", requireAuth, requirePermission(PERMISSIONS.AFFILIATES_MANAGE), async (req, res) => {
  const parsed = adminConfigSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: parsed.error.issues[0].message });
  }
  const config: MilestoneConfig = {
    discountLevels: sortLevels(parsed.data.discountLevels),
    allowanceLevels: sortLevels(parsed.data.allowanceLevels),
    badgeLevels: sortLevels(parsed.data.badgeLevels),
  };
  if (parsed.data.inviteeDiscountPercent !== undefined && parsed.data.inviteeDiscountPercent !== null) {
    config.inviteeDiscountPercent = parsed.data.inviteeDiscountPercent;
  }
  if (parsed.data.discountDurationDays !== undefined && parsed.data.discountDurationDays !== null) {
    config.discountDurationDays = parsed.data.discountDurationDays;
  }
  const check = await validateAdminConfig(config);
  if (!check.ok) {
    return res.status(400).json({ success: false, error: check.error });
  }
  await setAffiliateMilestones(config);
  const invitee = resolveInviteeConfig(config);
  res.json({
    success: true,
    data: {
      configSource: "db" as const,
      config: {
        inviteeDiscountPercent: invitee.inviteeDiscountPercent,
        discountDurationDays: invitee.discountDurationDays,
        discountLevels: config.discountLevels,
        allowanceLevels: config.allowanceLevels,
        badgeLevels: config.badgeLevels,
        abuseAction: getEnv().AFFILIATE_ABUSE_ACTION,
        abuseScope: getEnv().AFFILIATE_ABUSE_SCOPE,
      },
    },
  });
});

router.delete("/admin/config", requireAuth, requirePermission(PERMISSIONS.AFFILIATES_MANAGE), async (_req, res) => {
  await resetAffiliateMilestones();
  const { config } = await effectiveMilestoneConfig();
  const invitee = resolveInviteeConfig(config);
  res.json({
    success: true,
    data: {
      configSource: "env" as const,
      config: {
        inviteeDiscountPercent: invitee.inviteeDiscountPercent,
        discountDurationDays: invitee.discountDurationDays,
        discountLevels: config.discountLevels,
        allowanceLevels: config.allowanceLevels,
        badgeLevels: config.badgeLevels,
        abuseAction: getEnv().AFFILIATE_ABUSE_ACTION,
        abuseScope: getEnv().AFFILIATE_ABUSE_SCOPE,
      },
    },
  });
});

export default router;