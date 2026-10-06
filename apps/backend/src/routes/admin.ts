import crypto from "crypto";
import { Router, type NextFunction, type Request, type Response } from "express";
import bcrypt from "bcrypt";
import fs from "fs";
import path from "path";
import multer from "multer";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { invitePackConfig } from "../lib/invitePricing.js";
import {
  cancelInvitePurchase,
  fulfillInvitePurchase,
  notifyGuestPurchaseCodes,
  refundInvitePurchase,
  signInviteClaimToken,
} from "../lib/inviteOrders.js";
import { bumpAuthVersion } from "../lib/authVersion.js";
import { requireAuth } from "../middleware/auth.js";
import { requireAdmin, requirePermission } from "../middleware/admin.js";
import { getPolicyStatus, sendPolicyNotice, setPolicyNoticeNote } from "../lib/policyNotice.js";
import { updateProfileSchema, toPrismaJson, profileSlugSchema, stripHtml } from "../lib/validation.js";
import { upsertPrimaryProfile, getPrimaryProfile } from "../lib/profile.js";
import {
  ALL_PERMISSIONS,
  PERMISSIONS,
  SYSTEM_ROLE_SLUGS,
  hasPermission,
  permissionsFor,
} from "../lib/permissions.js";
import { dispatchWebhookEvent, dispatchWebhookEventAsync } from "../lib/webhook.js";
import {
  DAY_MS,
  getInviteGenerationEnabled,
  setInviteGenerationEnabled,
  applyInviteBanPolicy,
  getInvitePurchaseEnabled,
  getInviteResaleMode,
  setInvitePurchaseEnabled,
  setInviteResaleMode,
  type InviteDb,
} from "../lib/inviteService.js";
import { isReservedSlug } from "../lib/reservedSlugs.js";
import { getEnv } from "../config/env.js";
import { passkeyResidencyCutoff } from "../lib/webauthn.js";
import { issueCertificateForDomain, cleanupDomainFiles } from "../lib/acme.js";
import { requireNoUpdateLockdown } from "../lib/versionCheck.js";
import {
  getSeasonalConfig,
  setSeasonalConfig,
  invalidateSeasonalThemeCache,
  DEFAULT_SEASONAL_CONFIG,
  resolveActiveSeasonalTheme,
} from "../lib/seasonalThemes.js";
import { getFeaturedProfileUsername, setFeaturedProfileUsername } from "../lib/landingConfig.js";
import {
  effectiveTierConfig,
  setTierConfig,
  resetTierConfig,
  POLICY_VERSIONS,
  searchConsentEvidence,
  isNewsletterSendEnabled,
  buildNewsletterEmail,
  sendNewsletterEmail,
  signBroadcastUnsubscribeToken,
  broadcastUnsubscribeUrl,
  stripHtmlInput,
} from "../lib/newsletter.js";
import { isEmailEnabled } from "../lib/email.js";
import { getContactConfig, setContactConfig, CONTACT_METHODS } from "../lib/contactConfig.js";
import { clearPolicyContextCache } from "../lib/policyContextCache.js";
import { deleteUpload } from "../lib/mediaStore.js";
import {
  loadAbuseWhitelist,
  addAbuseWhitelistEntry,
  removeAbuseWhitelistEntry,
} from "../lib/antiAbuseWhitelist.js";

const router = Router();

const DEFAULT_PAGE_LIMIT = 50;
const MAX_PAGE_LIMIT = 100;

function paginationParams(query: Request["query"]): { take: number; skip: number; limit: number; offset: number } {
  const rawLimit = typeof query.limit === "string" ? Number.parseInt(query.limit, 10) : Number.NaN;
  const rawOffset = typeof query.offset === "string" ? Number.parseInt(query.offset, 10) : Number.NaN;
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), MAX_PAGE_LIMIT) : DEFAULT_PAGE_LIMIT;
  const offset = Number.isFinite(rawOffset) ? Math.max(rawOffset, 0) : 0;
  return { take: limit, skip: offset, limit, offset };
}

const TIER_RANK: Record<string, number> = { FREE: 0, PRO: 1, ENTERPRISE: 2 };

const updateUserSchema = z.object({
  username: z.string().min(3).max(32).regex(/^[a-z0-9_-]+$/).refine((u) => !isReservedSlug(u), "That username is reserved").optional(),
  email: z.string().email().transform((v) => v.toLowerCase()).optional(),
  roleId: z.string().uuid().optional(),
  tier: z.enum(["FREE", "PRO", "ENTERPRISE"]).optional(),
  trackLimit: z.number().int().min(0).max(100).nullable().optional(),
  profileLimit: z.number().int().min(0).max(100).nullable().optional(),
  aliasLimit: z.number().int().min(0).max(100).nullable().optional(),
  seatLimit: z.number().int().min(0).max(100000).nullable().optional(),
  badges: z.array(z.string().uuid()).optional(),
  inviteBanned: z.boolean().optional(),
});

const resetPasswordSchema = z.object({
  newPassword: z.string().min(8).max(128),
});

const permissionEnum = z.enum(ALL_PERMISSIONS as unknown as [string, ...string[]]);

const inviteConfigSchema = z.object({
  inviteBatchLimit: z.number().int().min(0).max(1000).optional(),
  inviteOutstandingLimit: z.number().int().min(0).max(100000).optional(),
  inviteCooldownMinutes: z.number().int().min(0).max(525600).optional(),
  inviteDefaultExpiryDays: z.number().int().min(1).max(3650).optional(),
  inviteMinExpiryDays: z.number().int().min(1).max(3650).optional(),
  inviteMaxExpiryDays: z.number().int().min(1).max(3650).optional(),
});

const roleSchema = z.object({
  name: z.string().min(2).max(32).transform((v) => stripHtml(v).trim()),
  description: z.string().max(256).nullable().optional().transform((v) => (v ? stripHtml(v) : v)),
  permissions: z.array(permissionEnum).optional(),
}).extend(inviteConfigSchema.shape);

const roleUpdateSchema = z.object({
  name: z.string().min(2).max(32).transform((v) => stripHtml(v).trim()).optional(),
  description: z.string().max(256).nullable().optional().transform((v) => (v ? stripHtml(v) : v)),
  permissions: z.array(permissionEnum).optional(),
}).extend(inviteConfigSchema.shape);

const landingConfigSchema = z.object({
  featuredProfileUsername: z
    .string()
    .max(64)
    .transform((v) => v.trim().replace(/^@/, ""))
    .refine((v) => v === "" || /^[a-z0-9_-]{2,64}$/.test(v), { message: "Invalid username (lowercase letters, numbers, dashes, underscores)" })
    .default(""),
});

const badgeSchema = z.object({
  slug: profileSlugSchema.transform((v) => stripHtml(v) || v).optional(),
  label: z.string().min(1).max(32).transform((v) => stripHtml(v).trim()),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, { message: "Color must be a hex value like #22c55e" }),
  icon: z.string().regex(/^[A-Z][A-Za-z0-9]*$/, { message: "Icon must be a valid icon name" }),
});

const badgeUpdateSchema = z.object({
  slug: profileSlugSchema.transform((v) => stripHtml(v) || v).optional(),
  label: z.string().min(1).max(32).transform((v) => stripHtml(v).trim()).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, { message: "Color must be a hex value like #22c55e" }).optional(),
  icon: z.string().regex(/^[A-Z][A-Za-z0-9]*$/, { message: "Icon must be a valid icon name" }).optional(),
});

const userSelect = {
  id: true,
  username: true,
  email: true,
  roleId: true,
  tier: true,
  trackLimit: true,
  profileLimit: true,
  aliasLimit: true,
  seatLimit: true,
  inviteBanned: true,
  inviteBannedAt: true,
  inviteAllowance: true,
  createdAt: true,
  updatedAt: true,
  role: { select: { id: true, slug: true, name: true, isSystem: true } },
  badges: { select: { id: true } },
} as const;

export interface PasskeySecurity {
  passkeyCount: number;
  passkeysFreshCount: number;
  residentPasskeyCount: number;
  residentFreshCount: number;
  hasNoPasskeys: boolean;
  passkeysUnverified: boolean;
  securityFlag: "none" | "no-passkeys" | "passkeys-unverified";
}

export function computePasskeySecurity(
  rows: { residentKey: boolean; residentVerifiedAt: Date | null }[],
  cutoff: Date,
  flagNoPasskeys: boolean,
): PasskeySecurity {
  let passkeyCount = 0;
  let passkeysFreshCount = 0;
  let residentPasskeyCount = 0;
  let residentFreshCount = 0;
  for (const row of rows) {
    passkeyCount++;
    const fresh = row.residentVerifiedAt !== null && row.residentVerifiedAt.getTime() >= cutoff.getTime();
    if (fresh) passkeysFreshCount++;
    if (row.residentKey) {
      residentPasskeyCount++;
      if (fresh) residentFreshCount++;
    }
  }
  const hasNoPasskeys = passkeyCount === 0;
  const passkeysUnverified = passkeyCount > 0 && passkeysFreshCount < passkeyCount;
  const securityFlag: PasskeySecurity["securityFlag"] =
    hasNoPasskeys ? (flagNoPasskeys ? "no-passkeys" : "none") : passkeysUnverified ? "passkeys-unverified" : "none";
  return {
    passkeyCount,
    passkeysFreshCount,
    residentPasskeyCount,
    residentFreshCount,
    hasNoPasskeys,
    passkeysUnverified,
    securityFlag,
  };
}

function serializeUser(u: {
  id: string;
  username: string;
  email: string;
  roleId: string;
  role: { id: string; slug: string; name: string; isSystem: boolean } | null;
  tier: string;
  trackLimit: number | null;
  profileLimit: number | null;
  aliasLimit: number | null;
  seatLimit: number | null;
  badges: { id: string }[];
  inviteBanned: boolean;
  inviteBannedAt: Date | null;
  inviteAllowance: number;
  createdAt: Date;
  updatedAt: Date;
}, security: PasskeySecurity, seat: { seatsUsed: number; hasPaidOrder: boolean }) {
  return {
    id: u.id,
    username: u.username,
    email: u.email,
    roleId: u.roleId,
    role: u.role,
    tier: u.tier,
    trackLimit: u.trackLimit,
    profileLimit: u.profileLimit,
    aliasLimit: u.aliasLimit,
    seatLimit: u.seatLimit,
    seatsUsed: seat.seatsUsed,
    hasPaidOrder: seat.hasPaidOrder,
    badges: u.badges.map((b) => b.id),
    inviteBanned: u.inviteBanned,
    inviteBannedAt: u.inviteBannedAt,
    inviteAllowance: u.inviteAllowance,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
    passkeyCount: security.passkeyCount,
    passkeysFreshCount: security.passkeysFreshCount,
    residentPasskeyCount: security.residentPasskeyCount,
    residentFreshCount: security.residentFreshCount,
    hasNoPasskeys: security.hasNoPasskeys,
    passkeysUnverified: security.passkeysUnverified,
    securityFlag: security.securityFlag,
  };
}

router.use(requireAuth, requireAdmin);

router.get("/users", requirePermission(PERMISSIONS.USERS_VIEW), async (req, res) => {
  const { take, skip, limit, offset } = paginationParams(req.query);
  const [users, total] = await Promise.all([
    prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      select: userSelect,
      take,
      skip,
    }),
    prisma.user.count(),
  ]);

  const ids = users.map((u) => u.id);
  const passkeyRows = ids.length > 0
    ? await prisma.passkey.findMany({
        where: { userId: { in: ids } },
        select: { userId: true, residentKey: true, residentVerifiedAt: true },
      })
    : [];
  const groups = new Map<string, { residentKey: boolean; residentVerifiedAt: Date | null }[]>();
  for (const row of passkeyRows) {
    const arr = groups.get(row.userId) ?? [];
    arr.push({ residentKey: row.residentKey, residentVerifiedAt: row.residentVerifiedAt });
    groups.set(row.userId, arr);
  }
  const cutoff = passkeyResidencyCutoff();
  const flagNoPasskeys = getEnv().ADMIN_FLAG_USERS_WITHOUT_PASSKEYS;

  const [referralRows, paidOrderRows] = await Promise.all([
    ids.length > 0
      ? prisma.inviteCode.groupBy({
          by: ["createdById"],
          where: { createdById: { in: ids }, usedById: { not: null } },
          _count: { _all: true },
        })
      : Promise.resolve([]),
    ids.length > 0
      ? prisma.order.findMany({
          where: { userId: { in: ids }, plan: "ENTERPRISE", status: "PAID" },
          select: { userId: true },
          distinct: ["userId"],
        })
      : Promise.resolve([]),
  ]);
  const referralCounts = new Map(referralRows.map((r) => [r.createdById, r._count._all]));
  const paidSet = new Set(paidOrderRows.map((o) => o.userId));

  res.json({
    success: true,
    data: users.map((u) =>
      serializeUser(
        u,
        computePasskeySecurity(groups.get(u.id) ?? [], cutoff, flagNoPasskeys),
        {
          seatsUsed: referralCounts.get(u.id) ?? 0,
          hasPaidOrder: paidSet.has(u.id),
        }
      )
    ),
    pagination: { total, limit, offset },
  });
});

router.patch("/users/:id", requirePermission(PERMISSIONS.USERS_MANAGE), requireNoUpdateLockdown, async (req: Request<{ id: string }>, res) => {
  const parsed = updateUserSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: parsed.error.issues[0].message,
    });
  }

  const { id } = req.params;
  const updates = parsed.data;

  if (id === req.userId) {
    return res.status(400).json({ success: false, error: "You cannot edit your own account here" });
  }

  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) {
    return res.status(404).json({ success: false, error: "User not found" });
  }

  if (updates.roleId || updates.tier) {
    const caller = await prisma.user.findUnique({
      where: { id: req.userId! },
      include: { role: true },
    });
    if (!caller || !hasPermission(caller.role, PERMISSIONS.ROLES_MANAGE)) {
      return res
        .status(403)
        .json({ success: false, error: "Changing roles or tiers requires the roles.manage permission" });
    }

    if (updates.roleId) {
      const role = await prisma.role.findUnique({ where: { id: updates.roleId } });
      if (!role) {
        return res.status(400).json({ success: false, error: "Role not found" });
      }
      const callerPerms = new Set(permissionsFor(caller.role));
      if (!permissionsFor(role).every((p) => callerPerms.has(p))) {
        return res
          .status(403)
          .json({ success: false, error: "Cannot assign a role with permissions beyond your own" });
      }
    }

    if (updates.tier) {
      const callerTierRank = TIER_RANK[caller.tier] ?? 0;
      const assignedRank = TIER_RANK[updates.tier];
      if (assignedRank > callerTierRank) {
        return res.status(403).json({ success: false, error: "Cannot assign a tier above your own tier" });
      }
    }
  }

  if (updates.username && updates.username !== existing.username) {
    const taken = await prisma.user.findUnique({ where: { username: updates.username } });
    if (taken) {
      return res.status(409).json({ success: false, error: "Username already taken" });
    }
    const slugTaken = await prisma.profile.findUnique({ where: { slug: updates.username } });
    if (slugTaken) {
      return res.status(409).json({ success: false, error: "Username already used as a profile URL" });
    }
  }

  if (updates.email && updates.email !== existing.email) {
    const taken = await prisma.user.findUnique({ where: { email: updates.email } });
    if (taken) {
      return res.status(409).json({ success: false, error: "Email already taken" });
    }
  }

  const data: Record<string, unknown> = {};
  if (updates.username !== undefined) data.username = updates.username;
  if (updates.email !== undefined) data.email = updates.email;
  if (updates.roleId !== undefined) data.roleId = updates.roleId;
  if (updates.tier !== undefined) data.tier = updates.tier;
  if (updates.trackLimit !== undefined) data.trackLimit = updates.trackLimit;
  if (updates.profileLimit !== undefined) data.profileLimit = updates.profileLimit;
  if (updates.aliasLimit !== undefined) data.aliasLimit = updates.aliasLimit;
  if (updates.seatLimit !== undefined) data.seatLimit = updates.seatLimit;
  if (updates.badges !== undefined) data.badges = { set: updates.badges.map((id) => ({ id })) };
  if (updates.inviteBanned === true) {
    data.inviteBanned = true;
    data.inviteBannedAt = new Date();
    // Deliberately NOT zeroing the balance here: `applyInviteBanPolicy` decides,
    // because a paid purchase must survive a ban (see the call below).
  } else if (updates.inviteBanned === false) {
    data.inviteBanned = false;
    data.inviteBannedAt = null;
  }

  try {
    const user = await prisma.$transaction(async (tx) => {
      const u = await tx.user.update({
        where: { id },
        data,
        select: userSelect,
      });

      if (updates.inviteBanned === true) {
        // A ban revokes event and role-quota codes. Codes the account *paid for*
        // stay live on purpose: a banned customer must still be able to hand a
        // purchased code to someone. Their balance is bounded by the 14-day
        // purchased window instead, and the expiry sweep restores whatever is
        // left once it closes.
        await tx.inviteCode.updateMany({
          where: { createdById: id, purchased: false, usedAt: null, revokedAt: null },
          data: { revokedAt: new Date() },
        });

        // The earned grants go too, not just their codes. `applyInviteBanPolicy`
        // overwrites the balance with the purchased remainder, so leaving live event
        // and role grants behind would leave the ledger disagreeing with the
        // counter that generation reads.
        await tx.inviteCreditGrant.updateMany({
          where: {
            userId: id,
            source: { not: "PURCHASED" },
            revokedAt: null,
            recoveredAt: null,
          },
          data: { revokedAt: new Date() },
        });

        const banPolicy = await applyInviteBanPolicy(id, tx as unknown as InviteDb);
        await tx.user.update({ where: { id }, data: banPolicy });
      }

      if (updates.username) {
        await tx.profile.updateMany({ where: { userId: id, isPrimary: true }, data: { slug: updates.username } });
      }

      return u;
    });

    dispatchWebhookEvent(id, "user.updated", {
      userId: id,
      updatedBy: req.userId,
      fields: Object.keys(data),
      updatedAt: new Date().toISOString(),
    });

    const passkeys = await prisma.passkey.findMany({
      where: { userId: id },
      select: { residentKey: true, residentVerifiedAt: true },
    });
    const security = computePasskeySecurity(
      passkeys,
      passkeyResidencyCutoff(),
      getEnv().ADMIN_FLAG_USERS_WITHOUT_PASSKEYS,
    );

    const [seatsUsed, paidOrder] = await Promise.all([
      prisma.inviteCode.count({
        where: { createdById: id, usedById: { not: null } },
      }),
      prisma.order.findFirst({
        where: { userId: id, plan: "ENTERPRISE", status: "PAID" },
        select: { id: true },
      }),
    ]);

    res.json({ success: true, data: serializeUser(user, security, { seatsUsed, hasPaidOrder: paidOrder !== null }) });
  } catch (err) {
    if (err instanceof Error && "code" in err && err.code === "P2002") {
      return res.status(409).json({ success: false, error: "Username already used as a profile URL" });
    }
    throw err;
  }
});

router.delete("/users/:id", requirePermission(PERMISSIONS.USERS_MANAGE), requireNoUpdateLockdown, async (req: Request<{ id: string }>, res) => {
  const { id } = req.params;

  if (id === req.userId) {
    return res.status(400).json({ success: false, error: "You cannot delete your own account" });
  }

  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      username: true,
      profiles: {
        select: {
          avatar: true,
          banner: true,
          musicTracks: { select: { filePath: true } },
        },
      },
    },
  });
  if (!user) {
    return res.status(404).json({ success: false, error: "User not found" });
  }

  await dispatchWebhookEventAsync(id, "user.deleted", {
    username: user.username,
    deletedAt: new Date().toISOString(),
  });

  await prisma.$transaction([
    prisma.authBan.deleteMany({ where: { kind: "ACCOUNT", value: id } }),
    prisma.authLog.deleteMany({ where: { OR: [{ accountId: id }, { username: user.username }] } }),
    prisma.inviteCode.deleteMany({ where: { createdById: id } }),
    prisma.user.delete({ where: { id } }),
  ]);

  for (const profile of user.profiles) {
    for (const filePath of [profile.avatar, profile.banner]) {
      if (filePath) {
        void deleteUpload(path.basename(filePath)).catch(() => undefined);
      }
    }
    for (const track of profile.musicTracks) {
      if (track.filePath) {
        void deleteUpload(path.basename(track.filePath)).catch(() => undefined);
      }
    }
  }

  dispatchWebhookEvent(id, "user.deleted", {
    username: user.username,
    deletedAt: new Date().toISOString(),
  });

  res.json({ success: true, message: "User deleted" });
});

// Remove a single passkey from a user's account. There is no owner-facing
// admin UI for this today; it exists so operators can strip a lost/compromised
// or otherwise unwanted security key without nuking the whole account (the
// owner-only self-service delete on /api/auth/passkeys/:id cannot reach it).
router.delete(
  "/users/:id/passkeys/:passkeyId",
  requirePermission(PERMISSIONS.USERS_MANAGE),
  requireNoUpdateLockdown,
  async (req: Request<{ id: string; passkeyId: string }>, res) => {
    const { id, passkeyId } = req.params;

    const user = await prisma.user.findUnique({ where: { id }, select: { id: true, username: true } });
    if (!user) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    const passkey = await prisma.passkey.findFirst({ where: { id: passkeyId, userId: id } });
    if (!passkey) {
      return res.status(404).json({ success: false, error: "Passkey not found for this user" });
    }

    await prisma.passkey.delete({ where: { id: passkeyId } });

    // Recompute the user's passkey security flags so the admin list reflects
    // the just-removed key immediately.
    const remaining = await prisma.passkey.findMany({
      where: { userId: id },
      select: { residentKey: true, residentVerifiedAt: true },
    });
    const security = computePasskeySecurity(
      remaining,
      passkeyResidencyCutoff(),
      getEnv().ADMIN_FLAG_USERS_WITHOUT_PASSKEYS,
    );

    const [seatsUsed, paidOrder] = await Promise.all([
      prisma.inviteCode.count({ where: { createdById: id, usedById: { not: null } } }),
      prisma.order.findFirst({ where: { userId: id, plan: "ENTERPRISE", status: "PAID" }, select: { id: true } }),
    ]);

    const freshUser = await prisma.user.findUnique({ where: { id }, select: userSelect });
    if (!freshUser) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    dispatchWebhookEvent(id, "user.updated", {
      userId: id,
      updatedBy: req.userId,
      fields: ["passkeys"],
      updatedAt: new Date().toISOString(),
    });

    res.json({
      success: true,
      message: "Passkey removed",
      data: serializeUser(freshUser, security, { seatsUsed, hasPaidOrder: paidOrder !== null }),
    });
  }
);

router.post("/users/:id/reset-password", requirePermission(PERMISSIONS.USERS_MANAGE), requireNoUpdateLockdown, async (req: Request<{ id: string }>, res) => {
  const parsed = resetPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: parsed.error.issues[0].message,
    });
  }

  const { id } = req.params;
  const { newPassword } = parsed.data;

  if (id === req.userId) {
    return res.status(400).json({ success: false, error: "You cannot reset your own password" });
  }

  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) {
    return res.status(404).json({ success: false, error: "User not found" });
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);

  await prisma.user.update({
    where: { id },
    data: { passwordHash },
  });

  // A4 — invalidate every previously issued session token for the reset user.
  await bumpAuthVersion(id);

  res.json({ success: true, message: "Password reset successfully" });
});

router.get("/users/:id/profile", requirePermission(PERMISSIONS.PROFILES_MANAGE), async (req: Request<{ id: string }>, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.params.id },
    select: { id: true, username: true },
  });

  if (!user) {
    return res.status(404).json({ success: false, error: "User not found" });
  }

  const profile = await getPrimaryProfile(user.id);

  res.json({ success: true, data: { username: user.username, profile } });
});

router.put("/users/:id/profile", requirePermission(PERMISSIONS.PROFILES_MANAGE), async (req: Request<{ id: string }>, res) => {
  const parsed = updateProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: parsed.error.issues[0].message,
    });
  }

  const user = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!user) {
    return res.status(404).json({ success: false, error: "User not found" });
  }

  const { socialLinks, theme, terminalCommands, countdown, ...rest } = parsed.data;

  const profile = await upsertPrimaryProfile(req.params.id, {
    ...rest,
    socialLinks: toPrismaJson(socialLinks),
    theme: toPrismaJson(theme),
    ...(terminalCommands !== undefined ? { terminalCommands: toPrismaJson(terminalCommands) } : {}),
    ...(countdown !== undefined ? { countdown: toPrismaJson(countdown) } : {}),
  });

  res.json({ success: true, data: profile });
});

router.get("/auth-bans", requirePermission(PERMISSIONS.BANS_MANAGE), async (req, res) => {
  const { take, skip, limit, offset } = paginationParams(req.query);
  const [bans, total] = await Promise.all([
    prisma.authBan.findMany({
      orderBy: { updatedAt: "desc" },
      take,
      skip,
    }),
    prisma.authBan.count(),
  ]);

  const accountIds = bans.filter((b) => b.kind === "ACCOUNT").map((b) => b.value);
  const accounts = await prisma.user.findMany({
    where: { id: { in: accountIds } },
    select: { id: true, username: true },
  });
  const usernameById = new Map(accounts.map((u) => [u.id, u.username]));

  res.json({
    success: true,
    data: bans.map((b) => ({
      id: b.id,
      kind: b.kind,
      value: b.kind === "ACCOUNT" ? (usernameById.get(b.value) ?? b.value) : b.value,
      accountId: b.kind === "ACCOUNT" ? b.value : null,
      failCount: b.failCount,
      lockedUntil: b.lockedUntil,
      permanent: b.permanent,
      createdAt: b.createdAt,
      updatedAt: b.updatedAt,
    })),
    pagination: { total, limit, offset },
  });
});

router.delete("/auth-bans/:id", requirePermission(PERMISSIONS.BANS_MANAGE), async (req: Request<{ id: string }>, res) => {
  const ban = await prisma.authBan.findUnique({ where: { id: req.params.id } });
  if (!ban) {
    return res.status(404).json({ success: false, error: "Ban not found" });
  }

  await prisma.authBan.delete({ where: { id: ban.id } });
  res.json({ success: true });
});

const authUnlockSchema = z.object({
  userId: z.string().min(1),
});

router.post("/auth-unlock", requirePermission(PERMISSIONS.BANS_MANAGE), async (req: Request, res: Response) => {
  const parsed = authUnlockSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: parsed.error.issues[0].message });
  }

  const user = await prisma.user.findUnique({
    where: { id: parsed.data.userId },
    select: { id: true, username: true },
  });
  if (!user) {
    return res.status(404).json({ success: false, error: "User not found" });
  }

  const logs = await prisma.authLog.findMany({
    where: { accountId: user.id },
    select: { ip: true, fingerprint: true },
  });
  const ips = [...new Set(logs.map((l) => l.ip).filter((v): v is string => Boolean(v)))];
  const cookies = [...new Set(logs.map((l) => l.fingerprint).filter((v): v is string => Boolean(v)))];

  const [accountBan, ipBans, cookieBans, failedLogs] = await Promise.all([
    prisma.authBan.deleteMany({ where: { kind: "ACCOUNT", value: user.id } }),
    prisma.authBan.deleteMany({ where: { kind: "IP", value: { in: ips } } }),
    prisma.authBan.deleteMany({ where: { kind: "COOKIE", value: { in: cookies } } }),
    prisma.authLog.deleteMany({ where: { accountId: user.id } }),
  ]);

  res.json({
    success: true,
    data: {
      username: user.username,
      removed: {
        accountBans: accountBan.count,
        ipBans: ipBans.count,
        cookieBans: cookieBans.count,
        failedLogs: failedLogs.count,
      },
    },
  });
});

router.get("/auth-logs", requirePermission(PERMISSIONS.LOGS_VIEW), async (req: Request, res) => {
  const { take, skip, limit, offset } = paginationParams(req.query);

  const [logs, total] = await Promise.all([
    prisma.authLog.findMany({
      orderBy: { createdAt: "desc" },
      take,
      skip,
    }),
    prisma.authLog.count(),
  ]);

  res.json({ success: true, data: logs, pagination: { total, limit, offset } });
});

const whitelistCreateSchema = z.object({
  value: z.string().trim().min(1).max(64),
  note: z.string().trim().max(200).optional().default(""),
});

router.get("/whitelist", requirePermission(PERMISSIONS.BANS_MANAGE), async (req, res) => {
  const { take, skip, limit, offset } = paginationParams(req.query);
  const all = await loadAbuseWhitelist();
  res.json({
    success: true,
    data: all.slice(skip, skip + take),
    pagination: { total: all.length, limit, offset },
  });
});

router.post("/whitelist", requirePermission(PERMISSIONS.BANS_MANAGE), async (req: Request, res: Response) => {
  const parsed = whitelistCreateSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: parsed.error.issues[0].message });
  }

  let createdBy = req.userId ?? "admin";
  if (req.userId) {
    const me = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { username: true },
    });
    createdBy = me?.username ?? createdBy;
  }

  try {
    const entry = await addAbuseWhitelistEntry({
      value: parsed.data.value,
      note: parsed.data.note,
      createdBy,
    });
    return res.status(201).json({ success: true, data: entry });
  } catch (err) {
    if (err instanceof Error) {
      return res.status(400).json({ success: false, error: err.message });
    }
    throw err;
  }
});

router.delete("/whitelist/:id", requirePermission(PERMISSIONS.BANS_MANAGE), async (req: Request<{ id: string }>, res) => {
  const removed = await removeAbuseWhitelistEntry(req.params.id);
  if (!removed) {
    return res.status(404).json({ success: false, error: "Whitelist entry not found" });
  }
  res.json({ success: true });
});

// ---------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------

function slugifyRoleName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
}

const INVITE_CONFIG_KEYS = [
  "inviteBatchLimit",
  "inviteOutstandingLimit",
  "inviteCooldownMinutes",
  "inviteDefaultExpiryDays",
  "inviteMinExpiryDays",
  "inviteMaxExpiryDays",
] as const;

function inviteConfigFrom(data: Record<string, unknown>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const key of INVITE_CONFIG_KEYS) {
    if (data[key] !== undefined) out[key] = data[key] as number;
  }
  return out;
}

router.get("/roles", requirePermission(PERMISSIONS.ROLES_MANAGE), async (_req, res) => {
  const roles = await prisma.role.findMany({ orderBy: [{ isSystem: "desc" }, { name: "asc" }], take: 200 });
  res.json({ success: true, data: roles });
});

router.post("/roles", requirePermission(PERMISSIONS.ROLES_MANAGE), requireNoUpdateLockdown, async (req: Request, res: Response) => {
  const parsed = roleSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: parsed.error.issues[0].message });
  }

  const { name, description, permissions } = parsed.data;
  const slug = slugifyRoleName(name);

  if (slug === SYSTEM_ROLE_SLUGS.ADMIN || slug === SYSTEM_ROLE_SLUGS.USER) {
    return res.status(400).json({ success: false, error: "That role name is reserved" });
  }

  const existing = await prisma.role.findFirst({ where: { OR: [{ slug }, { name }] } });
  if (existing) {
    return res.status(409).json({ success: false, error: "A role with that name already exists" });
  }

  const role = await prisma.role.create({
    data: {
      name,
      slug,
      description: description ?? null,
      permissions: permissions ?? [],
      ...inviteConfigFrom(parsed.data),
    },
  });

  res.status(201).json({ success: true, data: role });
});

router.patch("/roles/:id", requirePermission(PERMISSIONS.ROLES_MANAGE), requireNoUpdateLockdown, async (req: Request<{ id: string }>, res) => {
  const parsed = roleUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: parsed.error.issues[0].message });
  }

  const role = await prisma.role.findUnique({ where: { id: req.params.id } });
  if (!role) {
    return res.status(404).json({ success: false, error: "Role not found" });
  }

  if (role.slug === SYSTEM_ROLE_SLUGS.ADMIN && parsed.data.permissions) {
    const full = [...ALL_PERMISSIONS].sort().join(",");
    const submitted = [...parsed.data.permissions].sort().join(",");
    if (full !== submitted) {
      return res.status(400).json({ success: false, error: "The Admin role always has full permissions" });
    }
  }

  const data: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) {
    if (role.isSystem) {
      const existing = await prisma.role.findFirst({ where: { name: parsed.data.name, NOT: { id: role.id } } });
      if (existing) {
        return res.status(409).json({ success: false, error: "A role with that name already exists" });
      }
      data.name = parsed.data.name;
    } else {
      const newSlug = slugifyRoleName(parsed.data.name);
      if ((newSlug === SYSTEM_ROLE_SLUGS.ADMIN || newSlug === SYSTEM_ROLE_SLUGS.USER) && role.slug !== newSlug) {
        return res.status(400).json({ success: false, error: "That role name is reserved" });
      }
      const existing = await prisma.role.findFirst({ where: { OR: [{ slug: newSlug }, { name: parsed.data.name }], NOT: { id: role.id } } });
      if (existing) {
        return res.status(409).json({ success: false, error: "A role with that name already exists" });
      }
      data.name = parsed.data.name;
      data.slug = newSlug;
    }
  }
  if (parsed.data.description !== undefined) data.description = parsed.data.description;
  if (parsed.data.permissions !== undefined) data.permissions = parsed.data.permissions;
  Object.assign(data, inviteConfigFrom(parsed.data));

  const updated = await prisma.role.update({ where: { id: role.id }, data });
  res.json({ success: true, data: updated });
});

router.delete("/roles/:id", requirePermission(PERMISSIONS.ROLES_MANAGE), requireNoUpdateLockdown, async (req: Request<{ id: string }>, res) => {
  const role = await prisma.role.findUnique({ where: { id: req.params.id } });
  if (!role) {
    return res.status(404).json({ success: false, error: "Role not found" });
  }
  if (role.isSystem) {
    return res.status(400).json({ success: false, error: "System roles cannot be deleted" });
  }

  const userCount = await prisma.user.count({ where: { roleId: role.id } });
  if (userCount > 0) {
    return res.status(400).json({ success: false, error: "Assign users to another role before deleting this one" });
  }

  await prisma.role.delete({ where: { id: role.id } });
  res.json({ success: true });
});

// ---------------------------------------------------------------------
// Badges
// ---------------------------------------------------------------------

router.post("/invites", requirePermission(PERMISSIONS.INVITES_MANAGE), async (req: Request, res: Response) => {
  const parsed = z
    .object({
      count: z.number().int().min(1).max(50).default(1),
      expiresInDays: z.number().int().min(1).max(365).optional(),
    })
    .safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: parsed.error.issues[0].message });
  }

  const { count, expiresInDays } = parsed.data;

  await prisma.inviteCode.createMany({
    data: Array.from({ length: count }, () => ({
      code: crypto.randomBytes(8).toString("hex"),
      createdById: req.userId!,
      expiresAt: expiresInDays ? new Date(Date.now() + expiresInDays * DAY_MS) : null,
    })),
  });

  const created = await prisma.inviteCode.findMany({
    where: { createdById: req.userId! },
    orderBy: { createdAt: "desc" },
    take: count,
    select: {
      id: true,
      code: true,
      usedById: true,
      usedAt: true,
      expiresAt: true,
      revokedAt: true,
      createdAt: true,
      fromAllowance: true,
      note: true,
    },
  });

  res.status(201).json({ success: true, data: created });
});

router.get("/invites", requirePermission(PERMISSIONS.INVITES_MANAGE), async (req, res) => {
  const { take, skip, limit, offset } = paginationParams(req.query);
  const filter = req.query.filter;
  const where: Prisma.InviteCodeWhereInput =
    filter === "available"
      ? {
          usedById: null,
          revokedAt: null,
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        }
      : filter === "mine"
        ? { createdById: req.userId }
        : {};

  const [codes, total, allTotal, used, revoked, available] = await Promise.all([
    prisma.inviteCode.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take,
      skip,
      select: {
        id: true,
        code: true,
        createdById: true,
        usedById: true,
        usedAt: true,
        expiresAt: true,
        revokedAt: true,
        fromAllowance: true,
        createdAt: true,
        createdBy: { select: { id: true, username: true } },
        usedBy: { select: { id: true, username: true } },
      },
    }),
    prisma.inviteCode.count({ where }),
    prisma.inviteCode.count(),
    prisma.inviteCode.count({ where: { usedById: { not: null } } }),
    prisma.inviteCode.count({ where: { revokedAt: { not: null } } }),
    prisma.inviteCode.count({
      where: {
        usedById: null,
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
    }),
  ]);

  res.json({
    success: true,
    data: codes,
    pagination: { total, limit, offset },
    counts: { total: allTotal, used, revoked, available },
  });
});

const inviteSettingsSchema = z.object({
  userGenerationEnabled: z.boolean(),
});

router.get("/invite-settings", requirePermission(PERMISSIONS.INVITES_MANAGE), async (_req, res) => {
  const userGenerationEnabled = await getInviteGenerationEnabled();
  const eligibleUserCount = await prisma.user.count({ where: { inviteBanned: false } });
  res.json({ success: true, data: { userGenerationEnabled, eligibleUserCount } });
});

router.put("/invite-settings", requirePermission(PERMISSIONS.INVITES_MANAGE), async (req: Request, res: Response) => {
  const parsed = inviteSettingsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: parsed.error.issues[0].message });
  }
  await setInviteGenerationEnabled(parsed.data.userGenerationEnabled);
  // Generation and the store switch both appear in the legal pages, so the cached
  // snapshot has to be rebuilt rather than left describing the old state.
  await clearPolicyContextCache();
  res.json({ success: true, data: { userGenerationEnabled: parsed.data.userGenerationEnabled } });
});

const invitePurchaseSettingsSchema = z.object({
  purchaseEnabled: z.boolean(),
  // Kept in step with INVITE_RESALE_MODES so a mode added there cannot be
  // silently rejected here.
  resaleMode: z.enum(["off", "permitted", "legal", "enforced"]),
});

/**
 * Purchase and resale configuration.
 *
 * Split from `/invite-settings` on purpose: enabling free generation, selling
 * credits, and publishing a resale clause are three different decisions with
 * different legal consequences, and the operator should not have to flip the
 * generation switch to sell credits.
 */
router.get(
  "/invite-purchase-settings",
  requirePermission(PERMISSIONS.INVITES_MANAGE),
  async (_req: Request, res: Response) => {
    const [purchaseEnabled, resaleMode] = await Promise.all([
      getInvitePurchaseEnabled(),
      getInviteResaleMode(),
    ]);
    const { currency, packs } = invitePackConfig();
    res.json({
      success: true,
      data: {
        purchaseEnabled,
        resaleMode,
        currency,
        packs,
        configured: packs.length > 0,
        // Reported so the storefront card can warn loudly before an operator turns
        // sales on: a guest buyer's codes reach them by email, so a store with no
        // working mail is a store that cannot deliver. See the admin claim-link
        // escape hatch on /invite-purchases/:id/claim-link for how an operator
        // fulfils those orders anyway.
        emailConfigured: isEmailEnabled(),
      },
    });
  }
);

router.put(
  "/invite-purchase-settings",
  requirePermission(PERMISSIONS.INVITES_MANAGE),
  async (req: Request, res: Response) => {
    const parsed = invitePurchaseSettingsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.issues[0].message });
    }
    // Reject an "enabled" store with nothing to sell before it is persisted, so
    // the toggle can never read as live while the storefront is unreachable.
    if (parsed.data.purchaseEnabled && invitePackConfig().packs.length === 0) {
      return res.status(400).json({
        success: false,
        error: "Set INVITE_PRICE_PACKS before enabling invite purchases.",
      });
    }
    await setInvitePurchaseEnabled(parsed.data.purchaseEnabled);
    // Generation and the store switch both appear in the legal pages, so the cached
    // snapshot has to be rebuilt rather than left describing the old state.
    await clearPolicyContextCache();
    await setInviteResaleMode(parsed.data.resaleMode);
    // The Terms and Privacy pages publish a resale clause, so the cached snapshot
    // must not keep describing the previous stance.
    await clearPolicyContextCache();
    res.json({ success: true, data: parsed.data });
  }
);

/** Recent invite-credit purchases, newest first. */
router.get(
  "/invite-purchases",
  requirePermission(PERMISSIONS.INVITES_MANAGE),
  async (req: Request, res: Response) => {
    const parsed = z
      .object({ status: z.enum(["PENDING", "PAID", "REFUNDED", "CANCELLED"]).optional() })
      .safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: "Invalid filter." });
    }
    const orders = await prisma.invitePurchaseOrder.findMany({
      where: parsed.data.status ? { status: parsed.data.status } : {},
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        userId: true,
        buyerEmail: true,
        quantity: true,
        priceCents: true,
        currency: true,
        method: true,
        status: true,
        createdAt: true,
        paidAt: true,
        refundedAt: true,
        claimedById: true,
      },
    });
    res.json({ success: true, data: { purchases: orders } });
  }
);

const invitePurchaseActionSchema = z.object({ id: z.string().min(1).max(64) });

/**
 * Confirms a MANUAL purchase by hand, then applies the same fulfilment path a
 * gateway webhook would, so the ledger, the guest email and the idempotency
 * guards behave identically however the money arrived.
 */
router.post(
  "/invite-purchases/:id/confirm",
  requirePermission(PERMISSIONS.INVITES_MANAGE),
  async (req: Request, res: Response) => {
    const parsed = invitePurchaseActionSchema.safeParse(req.params);
    if (!parsed.success) return res.status(400).json({ success: false, error: "Invalid purchase." });

    const order = await prisma.invitePurchaseOrder.findUnique({ where: { id: parsed.data.id } });
    if (!order) return res.status(404).json({ success: false, error: "Purchase not found." });
    if (order.method !== "MANUAL") {
      return res
        .status(400)
        .json({ success: false, error: "Only manual purchases can be confirmed by hand." });
    }

    const result = await fulfillInvitePurchase(order.id, { gatewayStatus: "manual.confirmed" });
    if (result.credited) await notifyGuestPurchaseCodes(order.id);
    res.json({ success: true, data: result });
  }
);

/**
 * Records that a paid invite purchase was refunded.
 *
 * This does NOT move money. The platform has no outbound refund integration for
 * Stripe, PayPal or the crypto gateway, so an operator has to return the funds at
 * the provider first and use this endpoint to bring our records in line.
 *
 * What it does do is revoke the unspent artifacts of that exact order: invite
 * credits are deleted and guest codes are revoked. Credit already redeemed, and
 * the accounts and access it created, is deliberately left alone — revoking those
 * would mean deleting a real person's account.
 *
 * Idempotent-ish: a purchase that is not PAID is refused with 409, so this cannot
 * be used to walk an order backwards out of a refund.
 */
router.post(
  "/invite-purchases/:id/refund",
  requirePermission(PERMISSIONS.INVITES_MANAGE),
  async (req: Request, res: Response) => {
    const parsed = invitePurchaseActionSchema.safeParse(req.params);
    if (!parsed.success) return res.status(400).json({ success: false, error: "Invalid purchase." });
    const ok = await refundInvitePurchase(parsed.data.id, { gatewayStatus: "refunded" });
    if (!ok) return res.status(409).json({ success: false, error: "Purchase is not refundable." });
    res.json({ success: true, data: { refunded: true, providerRefundPerformed: false } });
  }
);

/**
 * Hands the operator a fresh claim link for a purchase.
 *
 * The emailed link is the intended delivery channel, and it is the only place the
 * token normally exists — which is the point: a guest's redeemable codes must not
 * be readable by whoever happens to intercept the HTTP response. But that leaves
 * an operator with no way to deliver anything at all when the platform has no
 * working mail (SMTP unset, or a send that keeps failing), and MANUAL is exactly
 * the mode a fresh install is forced to use while no gateway is configured. Taking
 * the money and then being unable to hand over the goods is not an acceptable
 * failure mode, so fulfilment cannot depend on the mailer.
 *
 * This is the escape hatch, deliberately narrow:
 *   - it is behind INVITES_MANAGE, so it needs the same permission as confirming
 *     the payment in the first place;
 *   - it returns ONLY a signed link, never the raw codes, so the codes still have
 *     to travel to the buyer through a channel the operator chooses;
 *   - a fresh token is signed per call and carries the same 30-day expiry as the
 *     emailed one, so re-issuing does not extend the window a code is claimable
 *     for beyond the configured TTL;
 *   - the request is not recorded as a notification. The order's `codesNotifiedAt`
 *     means "the buyer was emailed", and a link the operator copies by hand does
 *     not make that true.
 */
router.post(
  "/invite-purchases/:id/claim-link",
  requirePermission(PERMISSIONS.INVITES_MANAGE),
  async (req: Request, res: Response) => {
    const parsed = invitePurchaseActionSchema.safeParse(req.params);
    if (!parsed.success) return res.status(400).json({ success: false, error: "Invalid purchase." });

    const order = await prisma.invitePurchaseOrder.findUnique({ where: { id: parsed.data.id } });
    if (!order) return res.status(404).json({ success: false, error: "Purchase not found." });
    if (order.status === "REFUNDED" || order.status === "CANCELLED") {
      return res.status(409).json({
        success: false,
        error: "This purchase was closed, so there is nothing left to claim.",
      });
    }

    const token = signInviteClaimToken(order.id, getEnv().PRODUCT_PURCHASE_TOKEN_TTL_DAYS);
    const origin = getEnv().APP_URL.replace(/\/+$/, "");
    res.json({
      success: true,
      data: {
        url: `${origin}/invites/purchased/${encodeURIComponent(order.id)}?token=${encodeURIComponent(token)}`,
        expiresInDays: getEnv().PRODUCT_PURCHASE_TOKEN_TTL_DAYS,
        emailed: order.codesNotifiedAt !== null,
      },
    });
  }
);

router.post(
  "/invite-purchases/:id/cancel",
  requirePermission(PERMISSIONS.INVITES_MANAGE),
  async (req: Request, res: Response) => {
    const parsed = invitePurchaseActionSchema.safeParse(req.params);
    if (!parsed.success) return res.status(400).json({ success: false, error: "Invalid purchase." });
    await cancelInvitePurchase(parsed.data.id, { gatewayStatus: "cancelled" });
    res.json({ success: true });
  }
);

router.get("/landing-config", requirePermission(PERMISSIONS.SETTINGS_MANAGE), async (_req, res) => {
  res.json({ success: true, data: { featuredProfileUsername: await getFeaturedProfileUsername() } });
});

router.put("/landing-config", requirePermission(PERMISSIONS.SETTINGS_MANAGE), async (req: Request, res: Response) => {
  const parsed = landingConfigSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: parsed.error.issues[0].message });
  }
  await setFeaturedProfileUsername(parsed.data.featuredProfileUsername);
  res.json({ success: true, data: { featuredProfileUsername: parsed.data.featuredProfileUsername || null } });
});

const newsletterTierConfigSchema = z
  .object({
    FREE: z.object({ sendLimit: z.number().int().min(0).max(100), windowHours: z.number().int().min(1).max(8760) }),
    PRO: z.object({ sendLimit: z.number().int().min(0).max(100), windowHours: z.number().int().min(1).max(8760) }),
    ENTERPRISE: z.object({ sendLimit: z.number().int().min(0).max(100), windowHours: z.number().int().min(1).max(8760) }),
  })
  .strict();

router.get("/newsletter/config", requirePermission(PERMISSIONS.NEWSLETTER_MANAGE), async (_req, res) => {
  const { source, config } = await effectiveTierConfig();
  res.json({ success: true, data: { configSource: source, config } });
});

router.put("/newsletter/config", requirePermission(PERMISSIONS.NEWSLETTER_MANAGE), async (req: Request, res: Response) => {
  const parsed = newsletterTierConfigSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: parsed.error.issues[0].message });
  }
  await setTierConfig(parsed.data);
  res.json({ success: true, data: { configSource: "db", config: parsed.data } });
});

router.delete("/newsletter/config", requirePermission(PERMISSIONS.NEWSLETTER_MANAGE), async (_req, res) => {
  await resetTierConfig();
  const { source, config } = await effectiveTierConfig();
  res.json({ success: true, data: { configSource: source, config } });
});

router.get("/newsletter/sender-whitelist", requirePermission(PERMISSIONS.NEWSLETTER_MANAGE), async (req: Request, res: Response) => {
  const q = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 100) : "";
  const { take, skip, limit, offset } = paginationParams(req.query);
  const where = q
    ? {
        OR: [
          { username: { contains: q, mode: "insensitive" as const } },
          { email: { contains: q, mode: "insensitive" as const } },
        ],
      }
    : {};
  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: {
        id: true,
        username: true,
        email: true,
        tier: true,
        newsletterSenderWhitelisted: true,
        createdAt: true,
        profiles: { select: { id: true, displayName: true, slug: true } },
      },
      orderBy: { createdAt: "desc" },
      take,
      skip,
    }),
    prisma.user.count({ where }),
  ]);
  res.json({
    success: true,
    data: {
      users: users.map((u) => ({
        id: u.id,
        username: u.username,
        email: u.email,
        tier: u.tier,
        whitelisted: u.newsletterSenderWhitelisted,
        createdAt: u.createdAt,
        profiles: u.profiles.map((p) => ({ id: p.id, displayName: p.displayName, slug: p.slug })),
      })),
    },
    pagination: { total, limit, offset },
  });
});

router.put("/newsletter/sender-whitelist/:id", requirePermission(PERMISSIONS.NEWSLETTER_MANAGE), async (req: Request<{ id: string }>, res: Response) => {
  const parsed = z.object({ whitelisted: z.boolean() }).safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: parsed.error.issues[0].message });
  }
  const user = await prisma.user.findUnique({ where: { id: req.params.id }, select: { id: true, username: true, email: true } });
  if (!user) {
    return res.status(404).json({ success: false, error: "User not found" });
  }
  await prisma.user.update({ where: { id: user.id }, data: { newsletterSenderWhitelisted: parsed.data.whitelisted } });
  res.json({ success: true, data: { userId: user.id, username: user.username, email: user.email, whitelisted: parsed.data.whitelisted } });
});

router.get("/newsletter/consent-search", requirePermission(PERMISSIONS.NEWSLETTER_MANAGE), async (req: Request, res: Response) => {
  const email = typeof req.query.email === "string" ? req.query.email.trim().toLowerCase().slice(0, 254) : "";
  if (!email) {
    return res.status(400).json({ success: false, error: "email query parameter is required" });
  }
  const [trials, permanentSubscriptions, account] = await Promise.all([
    Promise.resolve(searchConsentEvidence(email)),
    prisma.newsletterSubscriber.findMany({
      where: { email },
      select: { email: true, profileId: true, subscribedAt: true, agreedAt: true, unsubscribedAt: true, tosVersion: true, privacyVersion: true },
      orderBy: { agreedAt: "desc" },
    }),
    prisma.user.findUnique({
      where: { email },
      select: { username: true, email: true, newsletterOptIn: true, newsletterOptInAt: true, broadcastUnsubscribedAt: true, acceptedPoliciesAt: true },
    }),
  ]);
  res.json({
    success: true,
    data: {
      email,
      policyVersions: { tos: POLICY_VERSIONS.tos, privacy: POLICY_VERSIONS.privacy },
      account: account
        ? {
            exists: true,
            username: account.username,
            announcementsOptIn: account.newsletterOptIn,
            announcementsOptInAt: account.newsletterOptInAt,
            announcementsUnsubscribedAt: account.broadcastUnsubscribedAt,
            acceptedPoliciesAt: account.acceptedPoliciesAt,
          }
        : { exists: false },
      consentEvents: trials.map((e) => ({ at: e.at, ip: e.ip, userAgent: e.userAgent, profileId: e.profileId })),
      subscriptions: permanentSubscriptions.map((s) => ({
        ...s,
        status: s.unsubscribedAt ? "unsubscribed" : "subscribed",
        consentCurrent: s.tosVersion === POLICY_VERSIONS.tos && s.privacyVersion === POLICY_VERSIONS.privacy,
      })),
    },
  });
});

const ADMIN_BROADCAST_RECIPIENT_CAP = 5000;

async function broadcastAudience(): Promise<{ users: { id: string; email: string }[]; count: number }> {
  const users = await prisma.user.findMany({
    where: { newsletterOptIn: true, broadcastUnsubscribedAt: null },
    select: { id: true, email: true },
  });
  return { users, count: users.length };
}

function stripSubjectBody(value: { subject: string; body: string }) {
  return {
    subject: stripHtmlInput(value.subject).trim(),
    body: stripHtmlInput(value.body).trim(),
  };
}

router.get("/newsletter/broadcast-audience", requirePermission(PERMISSIONS.NEWSLETTER_MANAGE), async (_req: Request, res: Response) => {
  const { count } = await broadcastAudience();
  res.json({ success: true, data: { count } });
});

router.get("/newsletter/broadcasts", requirePermission(PERMISSIONS.NEWSLETTER_MANAGE), async (_req: Request, res: Response) => {
  const broadcasts = await prisma.adminNewsletterSend.findMany({
    orderBy: { sentAt: "desc" },
    take: 50,
    select: { id: true, subject: true, recipientCount: true, successCount: true, sentAt: true },
  });
  res.json({ success: true, data: { broadcasts } });
});

router.post("/newsletter/broadcast", requirePermission(PERMISSIONS.NEWSLETTER_MANAGE), async (req: Request, res: Response) => {
  const parsed = z
    .object({
      subject: z.string().min(1).max(120),
      body: z.string().min(1).max(5000),
    })
    .safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: parsed.error.issues[0].message });
  }
  if (!isNewsletterSendEnabled()) {
    return res.status(503).json({ success: false, error: "Email delivery is not configured on this instance (SMTP or Resend)." });
  }

  const { users, count } = await broadcastAudience();
  if (count === 0) {
    return res.status(400).json({ success: false, error: "No users have opted in to platform announcements yet." });
  }
  if (count > ADMIN_BROADCAST_RECIPIENT_CAP) {
    return res.status(400).json({ success: false, error: `This broadcast would exceed the ${ADMIN_BROADCAST_RECIPIENT_CAP} recipient safety cap.` });
  }

  const env = getEnv();
  const fromName = env.SMTP_FROM_NAME;
  const fromEmail = env.SMTP_FROM_EMAIL || env.SMTP_USER;
  const website = env.APP_URL.replace(/\/+$/, "");
  const mailingAddress = env.NEWSLETTER_MAILING_ADDRESS;
  const { subject, body } = stripSubjectBody(parsed.data);

  let successCount = 0;
  const failed: string[] = [];
  for (const user of users) {
    const url = broadcastUnsubscribeUrl(signBroadcastUnsubscribeToken(user.id));
    const html = buildNewsletterEmail({ appName: env.APP_NAME, fromName, fromEmail, subject, body, unsubscribeUrl: url, mailingAddress, website });
    const result = await sendNewsletterEmail({ to: user.email, subject, html, listUnsubscribe: url });
    if (result.success) successCount += 1;
    else failed.push(user.email);
  }

  const record = await prisma.adminNewsletterSend.create({
    data: { subject, recipientCount: users.length, successCount },
    select: { id: true, subject: true, recipientCount: true, successCount: true, sentAt: true },
  });

  return res.json({ success: true, data: { broadcast: record, recipientCount: users.length, successCount, failedCount: failed.length } });
});

const inviteEventSchema = z.object({
  count: z.number().int().min(1).max(1000),
  expiryDays: z.number().int().min(1).max(3650),
});

router.post("/invite-events", requirePermission(PERMISSIONS.INVITES_MANAGE), async (req: Request, res: Response) => {
  const parsed = inviteEventSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: parsed.error.issues[0].message });
  }

  const { count, expiryDays } = parsed.data;
  const expiresAt = new Date(Date.now() + expiryDays * DAY_MS);

  const grantedUsers = await prisma.$executeRaw`
    UPDATE "users"
    SET "invite_allowance" = "invite_allowance" + ${count},
        "invite_allowance_expires_at" = GREATEST(COALESCE("invite_allowance_expires_at", ${expiresAt}), ${expiresAt}),
        "updated_at" = ${new Date()}
    WHERE "invite_banned" = FALSE
  `;

  const event = await prisma.inviteGrantEvent.create({
    data: { count, expiryDays, createdById: req.userId },
  });

  res.status(201).json({
    success: true,
    data: {
      grantedUsers,
      event,
      allowanceExpiresAt: expiresAt,
    },
  });
});

router.get("/invite-events", requirePermission(PERMISSIONS.INVITES_MANAGE), async (req, res) => {
  const { take, skip, limit, offset } = paginationParams(req.query);
  const [events, total] = await Promise.all([
    prisma.inviteGrantEvent.findMany({
      orderBy: { createdAt: "desc" },
      take,
      skip,
      include: { createdBy: { select: { id: true, username: true } } },
    }),
    prisma.inviteGrantEvent.count(),
  ]);
  res.json({ success: true, data: events, pagination: { total, limit, offset } });
});

router.get("/badges", requirePermission(PERMISSIONS.BADGES_MANAGE), async (_req, res) => {
  const badges = await prisma.badge.findMany({ orderBy: [{ isSystem: "desc" }, { label: "asc" }], take: 200 });
  res.json({ success: true, data: badges });
});

router.post("/badges", requirePermission(PERMISSIONS.BADGES_MANAGE), requireNoUpdateLockdown, async (req: Request, res: Response) => {
  const parsed = badgeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: parsed.error.issues[0].message });
  }

  const { label, color, icon, slug } = parsed.data;
  const finalSlug = slug ?? slugifyRoleName(label);

  const existing = await prisma.badge.findUnique({ where: { slug: finalSlug } });
  if (existing) {
    return res.status(409).json({ success: false, error: "A badge with that slug already exists" });
  }

  const badge = await prisma.badge.create({ data: { slug: finalSlug, label, color, icon } });
  res.status(201).json({ success: true, data: badge });
});

router.patch("/badges/:id", requirePermission(PERMISSIONS.BADGES_MANAGE), requireNoUpdateLockdown, async (req: Request<{ id: string }>, res) => {
  const parsed = badgeUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: parsed.error.issues[0].message });
  }

  const badge = await prisma.badge.findUnique({ where: { id: req.params.id } });
  if (!badge) {
    return res.status(404).json({ success: false, error: "Badge not found" });
  }

  const data: Record<string, unknown> = {};
  if (parsed.data.slug !== undefined) data.slug = parsed.data.slug;
  if (parsed.data.label !== undefined) data.label = parsed.data.label;
  if (parsed.data.color !== undefined) data.color = parsed.data.color;
  if (parsed.data.icon !== undefined) data.icon = parsed.data.icon;

  if (parsed.data.slug) {
    const existing = await prisma.badge.findUnique({ where: { slug: parsed.data.slug } });
    if (existing && existing.id !== badge.id) {
      return res.status(409).json({ success: false, error: "A badge with that slug already exists" });
    }
  }

  const updated = await prisma.badge.update({ where: { id: badge.id }, data });
  res.json({ success: true, data: updated });
});

router.delete("/badges/:id", requirePermission(PERMISSIONS.BADGES_MANAGE), requireNoUpdateLockdown, async (req: Request<{ id: string }>, res) => {
  const badge = await prisma.badge.findUnique({ where: { id: req.params.id } });
  if (!badge) {
    return res.status(404).json({ success: false, error: "Badge not found" });
  }
  if (badge.isSystem) {
    return res.status(400).json({ success: false, error: "System badges cannot be deleted" });
  }

  await prisma.badge.delete({ where: { id: badge.id } });
  res.json({ success: true });
});

router.get("/custom-domains", requirePermission(PERMISSIONS.PROFILES_MANAGE), async (req, res) => {
  const { take, skip, limit, offset } = paginationParams(req.query);
  const [entries, total] = await Promise.all([
    prisma.profileDomain.findMany({
      include: {
        profile: {
          include: { user: { select: { id: true, username: true, email: true, tier: true } } },
        },
      },
      orderBy: { createdAt: "desc" },
      take,
      skip,
    }),
    prisma.profileDomain.count(),
  ]);
  res.json({
    success: true,
    data: entries.map((e) => ({
      id: e.id,
      profileId: e.profileId,
      profileSlug: e.profile.slug,
      owner: e.profile.user,
      domain: e.domain,
      status: e.status,
      rootTarget: e.rootTarget,
      verificationToken: e.verificationToken,
      verifiedAt: e.verifiedAt,
      approvedAt: e.approvedAt,
      rejectedAt: e.rejectedAt,
      tlsStatus: e.tlsStatus,
      tlsIssuedAt: e.tlsIssuedAt,
      tlsExpiresAt: e.tlsExpiresAt,
      tlsError: e.tlsError,
      createdAt: e.createdAt,
    })),
    pagination: { total, limit, offset },
  });
});

router.post("/custom-domains/:id/approve", requirePermission(PERMISSIONS.PROFILES_MANAGE), async (req: Request<{ id: string }>, res) => {
  const entry = await prisma.profileDomain.findUnique({ where: { id: req.params.id } });
  if (!entry) {
    return res.status(404).json({ success: false, error: "Custom domain request not found" });
  }
  if (entry.status !== "VERIFIED") {
    return res.status(400).json({ success: false, error: "Domain must be verified before it can be approved." });
  }
  const updated = await prisma.profileDomain.update({
    where: { id: entry.id },
    data: { status: "ACTIVE", approvedAt: new Date() },
  });
  res.json({ success: true, data: updated });
});

router.post("/custom-domains/:id/reject", requirePermission(PERMISSIONS.PROFILES_MANAGE), async (req: Request<{ id: string }>, res) => {
  const entry = await prisma.profileDomain.findUnique({ where: { id: req.params.id } });
  if (!entry) {
    return res.status(404).json({ success: false, error: "Custom domain request not found" });
  }
  if (entry.status === "REJECTED") {
    return res.status(400).json({ success: false, error: "Domain is already rejected." });
  }
  const updated = await prisma.profileDomain.update({
    where: { id: entry.id },
    data: { status: "REJECTED", rejectedAt: new Date() },
  });
  res.json({ success: true, data: updated });
});

router.post("/custom-domains/:id/issue-cert", requirePermission(PERMISSIONS.PROFILES_MANAGE), async (req: Request<{ id: string }>, res) => {
  const entry = await prisma.profileDomain.findUnique({ where: { id: req.params.id } });
  if (!entry) {
    return res.status(404).json({ success: false, error: "Custom domain request not found" });
  }
  const result = await issueCertificateForDomain(entry.domain);
  if (!result.ok) {
    return res.status(400).json({ success: false, error: result.message });
  }
  const updated = await prisma.profileDomain.findUnique({ where: { id: entry.id } });
  res.json({ success: true, data: updated });
});

router.delete("/custom-domains/:id", requirePermission(PERMISSIONS.PROFILES_MANAGE), requireNoUpdateLockdown, async (req: Request<{ id: string }>, res) => {
  const entry = await prisma.profileDomain.findUnique({ where: { id: req.params.id } });
  if (!entry) {
    return res.status(404).json({ success: false, error: "Custom domain request not found" });
  }
  await prisma.profileDomain.delete({ where: { id: entry.id } });
  await cleanupDomainFiles(entry.domain);
  res.json({ success: true, message: "Custom domain removed" });
});

// ---- Seasonal Themes ----

const ALLOWED_IMG_EXTS = new Set([".jpeg", ".jpg", ".png", ".gif", ".webp"]);
const IMG_MAGIC_BYTES: [Buffer, string][] = [
  [Buffer.from([0xff, 0xd8, 0xff]), "image/jpeg"],
  [Buffer.from([0x89, 0x50, 0x4e, 0x47]), "image/png"],
  [Buffer.from([0x47, 0x49, 0x46, 0x38]), "image/gif"],
  [Buffer.from([0x52, 0x49, 0x46, 0x46]), "image/webp"],
];

function validateImgMagic(filePath: string): boolean {
  try {
    const fd = fs.openSync(filePath, "r");
    const buf = Buffer.alloc(12);
    fs.readSync(fd, buf, 0, 12, 0);
    fs.closeSync(fd);
    for (const [magic] of IMG_MAGIC_BYTES) {
      if (buf.subarray(0, magic.length).equals(magic)) return true;
    }
    return false;
  } catch {
    return false;
  }
}

const themeBgUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      cb(null, getEnv().LOCAL_STORAGE_PATH);
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${crypto.randomUUID()}${ext}`);
    },
  }),
  limits: { fileSize: 12 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ALLOWED_IMG_EXTS.has(ext)) cb(null, true);
    else cb(new multer.MulterError("LIMIT_UNEXPECTED_FILE", file.fieldname));
  },
});

function handleThemeBgUpload(req: Request, res: Response, next: NextFunction) {
  themeBgUpload.single("background")(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({ success: false, error: "File too large (max 12MB)" });
      }
      if (err.code === "LIMIT_UNEXPECTED_FILE") {
        return res.status(400).json({ success: false, error: "Invalid file type. Use JPEG, PNG, GIF, or WebP." });
      }
      return res.status(400).json({ success: false, error: `Upload error: ${err.message}` });
    }
    if (err) return res.status(500).json({ success: false, error: "Upload failed" });
    next();
  });
}

const seasonalConfigSchema = z.object({
  enabled: z.boolean(),
  autoSchedule: z.boolean(),
  respectUserPreferences: z.boolean(),
});

const seasonalThemeSchema = z.object({
  label: z.string().min(1).max(64).transform((v) => stripHtml(v) || v),
  emoji: z.string().max(16).nullable().optional(),
  kind: z.enum(["season", "holiday"]),
  enabled: z.boolean(),
  config: z
    .object({
      bg: z.string().max(128).nullable().optional(),
      cardBg: z.string().max(128).nullable().optional(),
      text: z.string().max(128).nullable().optional(),
      accent: z.string().max(128).nullable().optional(),
      fontFamily: z.string().max(128).nullable().optional(),
      layout: z.string().max(64).nullable().optional(),
      backgroundImage: z.string().max(512).nullable().optional(),
      effect: z.enum(["none", "snow", "pumpkins", "hearts", "leaves", "stars", "confetti", "sparkle"]).nullable().optional(),
    })
    .optional()
    .default({}),
  startMonth: z.number().int().min(1).max(12).nullable().optional(),
  startDay: z.number().int().min(1).max(31).nullable().optional(),
  endMonth: z.number().int().min(1).max(12).nullable().optional(),
  endDay: z.number().int().min(1).max(31).nullable().optional(),
  overrideState: z.enum(["on", "off", "schedule"]).nullable().optional(),
  allowedByAdmin: z.boolean(),
  sortOrder: z.number().int().min(0).max(10000).optional(),
});

const listThemesHandler = async (_req: Request, res: Response) => {
  const [themes, config, active] = await Promise.all([
    prisma.seasonalTheme.findMany({ orderBy: { sortOrder: "asc" } }),
    getSeasonalConfig(),
    resolveActiveSeasonalTheme(),
  ]);
  res.json({ success: true, data: { themes, config, active } });
};
router.get("/themes", requirePermission(PERMISSIONS.THEMES_MANAGE), listThemesHandler);
router.get("/seasonal-themes", requirePermission(PERMISSIONS.THEMES_MANAGE), listThemesHandler); // legacy alias

const saveThemesConfigHandler = async (req: Request, res: Response) => {
  const parsed = seasonalConfigSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: parsed.error.issues[0].message });
  }
  await setSeasonalConfig({ ...DEFAULT_SEASONAL_CONFIG, ...parsed.data });
  res.json({ success: true, data: { ...DEFAULT_SEASONAL_CONFIG, ...parsed.data } });
};
router.put("/themes/config", requirePermission(PERMISSIONS.THEMES_MANAGE), saveThemesConfigHandler);
router.put("/seasonal-themes/config", requirePermission(PERMISSIONS.THEMES_MANAGE), saveThemesConfigHandler); // legacy alias

const createThemeHandler = async (req: Request, res: Response) => {
  const parsed = seasonalThemeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: parsed.error.issues[0].message });
  }
  const d = parsed.data;
  const slug = (req.body?.slug as string | undefined)?.toString().toLowerCase().replace(/[^a-z0-9-]/g, "-") || cryptoSlug(d.label);
  const existing = await prisma.seasonalTheme.findUnique({ where: { slug } });
  if (existing) {
    return res.status(409).json({ success: false, error: "A theme with this slug already exists" });
  }
  const theme = await prisma.seasonalTheme.create({
    data: {
      slug,
      label: d.label,
      emoji: d.emoji ?? null,
      kind: d.kind,
      enabled: d.enabled,
      config: toPrismaJson(d.config),
      startMonth: d.startMonth ?? null,
      startDay: d.startDay ?? null,
      endMonth: d.endMonth ?? null,
      endDay: d.endDay ?? null,
      overrideState: d.overrideState === "schedule" ? null : d.overrideState ?? null,
      allowedByAdmin: d.allowedByAdmin,
      sortOrder: d.sortOrder ?? 0,
    },
  });
  await invalidateSeasonalThemeCache();
  res.json({ success: true, data: theme });
};
router.post("/themes", requirePermission(PERMISSIONS.THEMES_MANAGE), createThemeHandler);
router.post("/seasonal-themes", requirePermission(PERMISSIONS.THEMES_MANAGE), createThemeHandler); // legacy alias

const updateThemeHandler = async (req: Request<{ id: string }>, res: Response) => {
  const parsed = seasonalThemeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: parsed.error.issues[0].message });
  }
  const existing = await prisma.seasonalTheme.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    return res.status(404).json({ success: false, error: "Theme not found" });
  }
  const d = parsed.data;
  const theme = await prisma.seasonalTheme.update({
    where: { id: existing.id },
    data: {
      label: d.label,
      emoji: d.emoji ?? null,
      kind: d.kind,
      enabled: d.enabled,
      config: toPrismaJson(d.config),
      startMonth: d.startMonth ?? null,
      startDay: d.startDay ?? null,
      endMonth: d.endMonth ?? null,
      endDay: d.endDay ?? null,
      overrideState: d.overrideState === "schedule" ? null : d.overrideState ?? null,
      allowedByAdmin: d.allowedByAdmin,
      sortOrder: d.sortOrder ?? existing.sortOrder,
    },
  });
  await invalidateSeasonalThemeCache();
  res.json({ success: true, data: theme });
};
router.put("/themes/:id", requirePermission(PERMISSIONS.THEMES_MANAGE), updateThemeHandler);
router.put("/seasonal-themes/:id", requirePermission(PERMISSIONS.THEMES_MANAGE), updateThemeHandler); // legacy alias

const deleteThemeHandler = async (req: Request<{ id: string }>, res: Response) => {
  const existing = await prisma.seasonalTheme.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    return res.status(404).json({ success: false, error: "Theme not found" });
  }
  await prisma.seasonalTheme.delete({ where: { id: existing.id } });
  await invalidateSeasonalThemeCache();
  res.json({ success: true, message: "Theme deleted" });
};
router.delete("/themes/:id", requirePermission(PERMISSIONS.THEMES_MANAGE), deleteThemeHandler);
router.delete("/seasonal-themes/:id", requirePermission(PERMISSIONS.THEMES_MANAGE), deleteThemeHandler); // legacy alias

const uploadThemeBackgroundHandler = async (req: Request<{ id: string }>, res: Response) => {
  if (!req.file) {
    return res.status(400).json({ success: false, error: "No file uploaded" });
  }
  if (!validateImgMagic(req.file.path)) {
    await fs.promises.unlink(req.file.path).catch(() => undefined);
    return res.status(400).json({ success: false, error: "Invalid file type. Use JPEG, PNG, GIF, or WebP." });
  }

  const existing = await prisma.seasonalTheme.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    await fs.promises.unlink(req.file.path).catch(() => undefined);
    return res.status(404).json({ success: false, error: "Theme not found" });
  }

  const oldBg = existing.config && typeof existing.config === "object" && "backgroundImage" in existing.config
    ? (existing.config as { backgroundImage?: unknown }).backgroundImage
    : null;

  const filePath = `/uploads/${req.file.filename}`;
  const config = {
    ...(existing.config && typeof existing.config === "object" ? (existing.config as Record<string, unknown>) : {}),
    backgroundImage: filePath,
  };
  await prisma.seasonalTheme.update({ where: { id: existing.id }, data: { config: config as Prisma.InputJsonValue } });
  await invalidateSeasonalThemeCache();

  if (typeof oldBg === "string" && oldBg.startsWith("/uploads/")) {
    void deleteUpload(path.basename(oldBg)).catch(() => undefined);
  }

  res.json({ success: true, data: { backgroundImage: filePath } });
};
router.post("/themes/:id/background", requirePermission(PERMISSIONS.THEMES_MANAGE), handleThemeBgUpload, uploadThemeBackgroundHandler);
router.post("/seasonal-themes/:id/background", requirePermission(PERMISSIONS.THEMES_MANAGE), handleThemeBgUpload, uploadThemeBackgroundHandler); // legacy alias

router.delete("/themes/:id/background", requirePermission(PERMISSIONS.THEMES_MANAGE), async (req: Request<{ id: string }>, res) => {
  const existing = await prisma.seasonalTheme.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    return res.status(404).json({ success: false, error: "Theme not found" });
  }
  const config = existing.config && typeof existing.config === "object" ? { ...(existing.config as Record<string, unknown>) } : {};
  const oldBg = config.backgroundImage as string | undefined;
  delete config.backgroundImage;
  await prisma.seasonalTheme.update({ where: { id: existing.id }, data: { config: config as Prisma.InputJsonValue } });
  await invalidateSeasonalThemeCache();
  if (oldBg && oldBg.startsWith("/uploads/")) {
    const oldAbs = path.resolve(getEnv().LOCAL_STORAGE_PATH, path.basename(oldBg));
    if (fs.existsSync(oldAbs)) fs.unlinkSync(oldAbs);
  }
  res.json({ success: true });
});
router.delete("/seasonal-themes/:id/background", requirePermission(PERMISSIONS.THEMES_MANAGE), async (req: Request<{ id: string }>, res) => {
  const existing = await prisma.seasonalTheme.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    return res.status(404).json({ success: false, error: "Theme not found" });
  }
  const config = existing.config && typeof existing.config === "object" ? { ...(existing.config as Record<string, unknown>) } : {};
  const oldBg = config.backgroundImage as string | undefined;
  delete config.backgroundImage;
  await prisma.seasonalTheme.update({ where: { id: existing.id }, data: { config: config as Prisma.InputJsonValue } });
  await invalidateSeasonalThemeCache();
  if (oldBg && oldBg.startsWith("/uploads/")) {
    const oldAbs = path.resolve(getEnv().LOCAL_STORAGE_PATH, path.basename(oldBg));
    if (fs.existsSync(oldAbs)) fs.unlinkSync(oldAbs);
  }
  res.json({ success: true });
});

function cryptoSlug(label: string): string {
  return `${label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32) || "theme"}-${Math.random().toString(36).slice(2, 7)}`;
}

const adminOrderStatusSchema = z.object({
  status: z.enum(["PENDING", "PAID", "CANCELLED", "REFUNDED"]),
  adminNote: z.string().max(500).optional(),
});

router.get("/orders", requirePermission(PERMISSIONS.ORDERS_MANAGE), async (req: Request, res) => {
  const { take, skip } = paginationParams(req.query);
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const where: Prisma.OrderWhereInput =
    status === "PENDING" || status === "PAID" || status === "CANCELLED" || status === "REFUNDED" ? { status } : {};

  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take,
      skip,
      include: { user: { select: { id: true, username: true, email: true, tier: true } } },
    }),
    prisma.order.count({ where }),
  ]);

  res.json({
    success: true,
    data: orders,
    pagination: { total, limit: take, offset: skip },
  });
});

router.patch("/orders/:id", requirePermission(PERMISSIONS.ORDERS_MANAGE), async (req: Request<{ id: string }>, res) => {
  const parsed = adminOrderStatusSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: parsed.error.issues[0].message });
  }

  const existing = await prisma.order.findUnique({
    where: { id: req.params.id },
    include: { user: { select: { id: true, tier: true } } },
  });
  if (!existing) {
    return res.status(404).json({ success: false, error: "Order not found" });
  }

  const note = parsed.data.adminNote ? stripHtml(parsed.data.adminNote).slice(0, 500) : undefined;
  const data: Prisma.OrderUpdateInput = { adminNote: note ?? undefined };

  switch (parsed.data.status) {
    case "PAID":
      data.status = "PAID";
      data.paidAt = new Date();
      break;
    case "CANCELLED":
      if (existing.status === "PAID") {
        return res.status(409).json({ success: false, error: "A paid order cannot be cancelled; refund it instead" });
      }
      data.status = "CANCELLED";
      break;
    case "REFUNDED":
      if (existing.status !== "PAID") {
        return res.status(409).json({ success: false, error: "Only a paid order can be refunded" });
      }
      data.status = "REFUNDED";
      break;
    case "PENDING":
      if (existing.status === "PAID") {
        return res.status(409).json({ success: false, error: "A paid order cannot be reverted to pending" });
      }
      data.status = "PENDING";
      data.paidAt = null;
      break;
  }

  const plan = existing.plan;
  const userTier = existing.user.tier;
  const order = await prisma.$transaction(async (tx) => {
    const updated = await tx.order.update({ where: { id: existing.id }, data });
    if (parsed.data.status === "PAID" && TIER_RANK[plan] > TIER_RANK[userTier]) {
      await tx.user.update({ where: { id: updated.userId }, data: { tier: plan } });
    }
    return updated;
  });

  res.json({ success: true, data: order });
});

router.get("/orders-config", requirePermission(PERMISSIONS.SETTINGS_MANAGE), async (_req, res) => {
  res.json({ success: true, data: await getContactConfig() });
});

const ordersConfigSchema = z.object({
  method: z.enum(CONTACT_METHODS),
  value: z.string().max(300).default(""),
});

router.put("/orders-config", requirePermission(PERMISSIONS.SETTINGS_MANAGE), async (req: Request, res) => {
  const parsed = ordersConfigSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: parsed.error.issues[0].message });
  }
  await setContactConfig(parsed.data.method, parsed.data.value);
  res.json({ success: true, data: await getContactConfig() });
});

export default router;


// ---------------------------------------------------------------------------
// Legal policy status + change notice (instance owner)
//
// Shows which POLICY_VERSIONS are live, how many accounts still have to accept
// them, and lets the operator email everyone who has not. Works whether or not
// POLICY_NOTICE_AUTO_EMAIL is on: the env toggle only controls the automatic
// boot-time run, the button is always available.
// ---------------------------------------------------------------------------

router.get("/policy/status", requirePermission(PERMISSIONS.SETTINGS_MANAGE), async (_req, res) => {
  try {
    res.json({ success: true, data: await getPolicyStatus() });
  } catch (err) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : "Failed to read policy status" });
  }
});

router.put("/policy/note", requirePermission(PERMISSIONS.SETTINGS_MANAGE), async (req, res) => {
  const note = typeof req.body?.note === "string" ? req.body.note : null;
  try {
    await setPolicyNoticeNote(note);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ success: false, error: err instanceof Error ? err.message : "Invalid note" });
  }
});

router.post("/policy/notify", requirePermission(PERMISSIONS.SETTINGS_MANAGE), async (_req, res) => {
  try {
    const result = await sendPolicyNotice();
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : "Failed to send the notice" });
  }
});
