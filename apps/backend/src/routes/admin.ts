import { Router, type Request, type Response } from "express";
import bcrypt from "bcrypt";
import fs from "fs";
import path from "path";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { requireAdmin, requirePermission } from "../middleware/admin.js";
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
import { DAY_MS, getInviteGenerationEnabled, setInviteGenerationEnabled } from "../lib/inviteService.js";
import { getEnv } from "../config/env.js";
import { issueCertificateForDomain } from "../lib/acme.js";
import { requireNoUpdateLockdown } from "../lib/versionCheck.js";

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
  username: z.string().min(3).max(32).regex(/^[a-z0-9_-]+$/).optional(),
  email: z.string().email().transform((v) => v.toLowerCase()).optional(),
  roleId: z.string().uuid().optional(),
  tier: z.enum(["FREE", "PRO", "ENTERPRISE"]).optional(),
  trackLimit: z.number().int().min(0).max(100).nullable().optional(),
  profileLimit: z.number().int().min(0).max(100).nullable().optional(),
  aliasLimit: z.number().int().min(0).max(100).nullable().optional(),
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
  inviteBanned: true,
  inviteBannedAt: true,
  inviteAllowance: true,
  createdAt: true,
  updatedAt: true,
  role: { select: { id: true, slug: true, name: true, isSystem: true } },
  badges: { select: { id: true } },
} as const;

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
  badges: { id: string }[];
  inviteBanned: boolean;
  inviteBannedAt: Date | null;
  inviteAllowance: number;
  createdAt: Date;
  updatedAt: Date;
}) {
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
    badges: u.badges.map((b) => b.id),
    inviteBanned: u.inviteBanned,
    inviteBannedAt: u.inviteBannedAt,
    inviteAllowance: u.inviteAllowance,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
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

  res.json({
    success: true,
    data: users.map(serializeUser),
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
  if (updates.badges !== undefined) data.badges = { set: updates.badges.map((id) => ({ id })) };
  if (updates.inviteBanned === true) {
    data.inviteBanned = true;
    data.inviteBannedAt = new Date();
    data.inviteAllowance = 0;
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
        await tx.inviteCode.updateMany({
          where: { createdById: id, usedAt: null, revokedAt: null },
          data: { revokedAt: new Date() },
        });
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

    res.json({ success: true, data: serializeUser(user) });
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

  const storageDir = getEnv().LOCAL_STORAGE_PATH;
  for (const profile of user.profiles) {
    for (const filePath of [profile.avatar, profile.banner]) {
      if (filePath) {
        const abs = path.resolve(storageDir, path.basename(filePath));
        if (fs.existsSync(abs)) fs.unlinkSync(abs);
      }
    }
    for (const track of profile.musicTracks) {
      if (track.filePath) {
        const abs = path.resolve(storageDir, path.basename(track.filePath));
        if (fs.existsSync(abs)) fs.unlinkSync(abs);
      }
    }
  }

  dispatchWebhookEvent(id, "user.deleted", {
    username: user.username,
    deletedAt: new Date().toISOString(),
  });

  res.json({ success: true, message: "User deleted" });
});

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

  const { socialLinks, theme, ...rest } = parsed.data;

  const profile = await upsertPrimaryProfile(req.params.id, {
    ...rest,
    socialLinks: toPrismaJson(socialLinks),
    theme: toPrismaJson(theme),
  });

  res.json({ success: true, data: profile });
});

router.get("/auth-bans", requirePermission(PERMISSIONS.BANS_MANAGE), async (_req, res) => {
  const bans = await prisma.authBan.findMany({
    orderBy: { updatedAt: "desc" },
    take: 200,
  });

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
  const requested = Number(req.query.limit) || 100;
  const limit = Math.min(Math.max(requested, 1), 500);

  const logs = await prisma.authLog.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  res.json({ success: true, data: logs });
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

  const [codes, total] = await Promise.all([
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
  ]);

  res.json({ success: true, data: codes, pagination: { total, limit, offset } });
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
  res.json({ success: true, data: { userGenerationEnabled: parsed.data.userGenerationEnabled } });
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

router.get("/invite-events", requirePermission(PERMISSIONS.INVITES_MANAGE), async (_req, res) => {
  const events = await prisma.inviteGrantEvent.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { createdBy: { select: { id: true, username: true } } },
  });
  res.json({ success: true, data: events });
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

router.get("/custom-domains", requirePermission(PERMISSIONS.PROFILES_MANAGE), async (_req, res) => {
  const entries = await prisma.profileDomain.findMany({
    include: {
      profile: {
        include: { user: { select: { id: true, username: true, email: true, tier: true } } },
      },
    },
    orderBy: { createdAt: "desc" },
  });
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
  });
});

router.post("/custom-domains/:id/approve", requirePermission(PERMISSIONS.PROFILES_MANAGE), async (req: Request<{ id: string }>, res) => {
  const entry = await prisma.profileDomain.findUnique({ where: { id: req.params.id } });
  if (!entry) {
    return res.status(404).json({ success: false, error: "Custom domain request not found" });
  }
  if (entry.status !== "VERIFIED") {
    return res.status(400).json({ success: false, error: `Only a VERIFIED domain can be approved (current status: ${entry.status}).` });
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

export default router;
