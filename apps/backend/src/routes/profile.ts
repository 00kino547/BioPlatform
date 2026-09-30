import { Router, type Request, type Response, type NextFunction } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { requireApiLevel } from "../middleware/admin.js";
import { getEnv } from "../config/env.js";
import { isReservedSlug } from "../lib/reservedSlugs.js";
import {
  ALLOWED_PLATFORMS,
  updateProfileSchema,
  profileSlugSchema,
  toPrismaJson,
  stripHtml,
} from "../lib/validation.js";
import { profileScope, upsertPrimaryProfile, resolveProfileId } from "../lib/profile.js";
import { getProfileLimit, getAliasLimit } from "../lib/limits.js";
import { dispatchWebhookEvent } from "../lib/webhook.js";
import { orderBadges } from "../lib/badges.js";
import { writeUpload, deleteUpload } from "../lib/mediaStore.js";
import { deleteProductUpload } from "../lib/shop.js";
import { analyticsAllowed, parseCookies } from "../lib/privacy.js";
import {
  buildExportBuffer,
  EXPORT_CONTENT_TYPES,
  type ExportFormat,
  parseImportBuffer,
  normalizeImportedSocialLinks,
  profileToTransferJson,
} from "../lib/profileTransfer.js";
import { renderProfileOgCached } from "../lib/profileOg.js";
import { getCachedPresence, describeActivities } from "../lib/discordGateway.js";
import { buildDiscordAvatarUrl, DISCORD_STATUS_LABELS } from "../lib/discord.js";
import { refreshDiscordPostForProfile } from "../lib/discordPost.js";
import { contentEtag, clientHasFreshBody } from "../lib/httpCache.js";
import { resolveProfileSeasonalTheme } from "../lib/seasonalThemes.js";

function serializeOwnProfile<T extends Record<string, unknown> & { badges?: { id: string }[]; badgeOrder?: string[] }>(profile: T) {
  const { badges = [], badgeOrder, ...rest } = profile;
  return { ...rest, badges: orderBadges(badges, badgeOrder).map((b) => b.id) };
}

function getViewerId(req: Request): string | undefined {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return undefined;
  try {
    const payload = jwt.verify(header.slice(7), getEnv().JWT_SECRET) as { userId: string; purpose?: string };
    if (payload.purpose !== undefined && payload.purpose !== "auth") return undefined;
    return payload.userId;
  } catch {
    return undefined;
  }
}

function getVisitorId(req: Request): string {
  const ip = req.ip ?? "unknown";
  const ua = req.headers["user-agent"] || "unknown";
  const cookies = parseCookies(req.headers.cookie);
  const bpVid = cookies["bp_vid"] || "";
  return crypto.createHash("sha256").update(`${ip}|${ua}|${bpVid}`).digest("hex").slice(0, 32);
}

function getClientIp(req: Request): string {
  return req.ip ?? "unknown";
}

const PUBLIC_LIMIT_MAX = 60;
const PUBLIC_LIMIT_WINDOW_MS = 60 * 1000;
const publicHits = new Map<string, number[]>();

const PROFILE_CLICK_LIMIT_MAX = 60;
const PROFILE_CLICK_WINDOW_MS = 60 * 1000;
const profileClickHits = new Map<string, number[]>();

const EMAIL_NOTIFY_COOLDOWN_MS = 5 * 60 * 1000;
const lastEmailNotify = new Map<string, number>();

// Hard throttle for the username availability oracle + rename endpoint.
// Availability is inherently an enumeration oracle; we gate it on login plus
// a tight per-IP window, and the handler itself hides handles owned by private
// profiles so probing never reveals which unlisted accounts exist.
const USERNAME_CHECK_LIMIT_MAX = 20;
const USERNAME_CHECK_WINDOW_MS = 60 * 1000;
const USERNAME_RENAME_LIMIT_MAX = 5;
const USERNAME_RENAME_WINDOW_MS = 60 * 1000;
const usernameCheckHits = new Map<string, number[]>();
const usernameRenameHits = new Map<string, number[]>();

function usernameCheckRateLimited(ip: string): boolean {
  const now = Date.now();
  const cutoff = now - USERNAME_CHECK_WINDOW_MS;
  const hits = (usernameCheckHits.get(ip) ?? []).filter((t) => t > cutoff);
  if (hits.length >= USERNAME_CHECK_LIMIT_MAX) {
    usernameCheckHits.set(ip, hits);
    return true;
  }
  hits.push(now);
  usernameCheckHits.set(ip, hits);
  return false;
}

function usernameRenameRateLimited(ip: string): boolean {
  const now = Date.now();
  const cutoff = now - USERNAME_RENAME_WINDOW_MS;
  const hits = (usernameRenameHits.get(ip) ?? []).filter((t) => t > cutoff);
  if (hits.length >= USERNAME_RENAME_LIMIT_MAX) {
    usernameRenameHits.set(ip, hits);
    return true;
  }
  hits.push(now);
  usernameRenameHits.set(ip, hits);
  return false;
}

function emailNotifyRateLimited(profileId: string, type: string): boolean {
  const key = `${profileId}:${type}`;
  const now = Date.now();
  const last = lastEmailNotify.get(key) ?? 0;
  if (now - last < EMAIL_NOTIFY_COOLDOWN_MS) return true;
  lastEmailNotify.set(key, now);
  return false;
}

function publicRateLimit(req: Request, res: Response, next: NextFunction) {
  const ip = req.ip ?? "unknown";
  const now = Date.now();
  const cutoff = now - PUBLIC_LIMIT_WINDOW_MS;
  const hits = (publicHits.get(ip) ?? []).filter((t) => t > cutoff);
  if (hits.length >= PUBLIC_LIMIT_MAX) {
    publicHits.set(ip, hits);
    return res.status(429).json({ success: false, error: "Too many requests. Please try again later." });
  }
  hits.push(now);
  publicHits.set(ip, hits);
  next();
}

function profileClickRateLimited(profileId: string): boolean {
  const now = Date.now();
  const cutoff = now - PROFILE_CLICK_WINDOW_MS;
  const hits = (profileClickHits.get(profileId) ?? []).filter((t) => t > cutoff);
  if (hits.length >= PROFILE_CLICK_LIMIT_MAX) {
    profileClickHits.set(profileId, hits);
    return true;
  }
  hits.push(now);
  profileClickHits.set(profileId, hits);
  return false;
}

setInterval(() => {
  const cutoff = Date.now() - PUBLIC_LIMIT_WINDOW_MS;
  for (const [ip, hits] of publicHits) {
    const remaining = hits.filter((t) => t > cutoff);
    if (remaining.length === 0) {
      publicHits.delete(ip);
    } else {
      publicHits.set(ip, remaining);
    }
  }

  const profileCutoff = Date.now() - PROFILE_CLICK_WINDOW_MS;
  for (const [profileId, hits] of profileClickHits) {
    const remaining = hits.filter((t) => t > profileCutoff);
    if (remaining.length === 0) {
      profileClickHits.delete(profileId);
    } else {
      profileClickHits.set(profileId, remaining);
    }
  }
}, PUBLIC_LIMIT_WINDOW_MS);

const router = Router();

const uploadsDir = path.resolve(getEnv().LOCAL_STORAGE_PATH);
fs.mkdirSync(uploadsDir, { recursive: true });

const ALLOWED_EXTS = new Set([".jpeg", ".jpg", ".png", ".gif", ".webp"]);

const MAGIC_BYTES: [Buffer, string][] = [
  [Buffer.from([0xff, 0xd8, 0xff]), "image/jpeg"],
  [Buffer.from([0x89, 0x50, 0x4e, 0x47]), "image/png"],
  [Buffer.from([0x47, 0x49, 0x46, 0x38]), "image/gif"],
  [Buffer.from([0x52, 0x49, 0x46, 0x46]), "image/webp"],
];

function validateFileMagic(filePath: string, _expectedExt: string): boolean {
  try {
    const fd = fs.openSync(filePath, "r");
    const buf = Buffer.alloc(12);
    fs.readSync(fd, buf, 0, 12, 0);
    fs.closeSync(fd);
    for (const [magic] of MAGIC_BYTES) {
      if (buf.subarray(0, magic.length).equals(magic)) return true;
    }
    return false;
  } catch {
    return false;
  }
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      cb(null, uploadsDir);
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${crypto.randomUUID()}${ext}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ALLOWED_EXTS.has(ext)) {
      cb(null, true);
    } else {
      cb(new multer.MulterError("LIMIT_UNEXPECTED_FILE", file.fieldname));
    }
  },
});

function handleUpload(field: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    upload.single(field)(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return res.status(400).json({ success: false, error: "File too large (max 5MB)" });
        }
        if (err.code === "LIMIT_UNEXPECTED_FILE") {
          return res.status(400).json({ success: false, error: "Invalid file type. Use JPEG, PNG, GIF, or WebP." });
        }
        return res.status(400).json({ success: false, error: `Upload error: ${err.message}` });
      }
      if (err) {
        return res.status(500).json({ success: false, error: "Upload failed" });
      }
      next();
    });
  };
}

const backgroundUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      cb(null, uploadsDir);
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${crypto.randomUUID()}${ext}`);
    },
  }),
  limits: { fileSize: 12 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ALLOWED_EXTS.has(ext)) {
      cb(null, true);
    } else {
      cb(new multer.MulterError("LIMIT_UNEXPECTED_FILE", file.fieldname));
    }
  },
});

function handleBackgroundUpload(field: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    backgroundUpload.single(field)(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return res.status(400).json({ success: false, error: "File too large (max 12MB)" });
        }
        if (err.code === "LIMIT_UNEXPECTED_FILE") {
          return res.status(400).json({ success: false, error: "Invalid file type. Use JPEG, PNG, GIF, or WebP." });
        }
        return res.status(400).json({ success: false, error: `Upload error: ${err.message}` });
      }
      if (err) {
        return res.status(500).json({ success: false, error: "Upload failed" });
      }
      next();
    });
  };
}

router.get("/me", requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.userId! },
    select: { tier: true, profileLimit: true, aliasLimit: true, badges: true },
  });
  if (!user) {
    return res.status(404).json({ success: false, error: "User not found" });
  }

  const [profiles, aliasCount] = await Promise.all([
    prisma.profile.findMany({
      where: { userId: req.userId! },
      orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
      include: {
        aliases: { orderBy: { createdAt: "asc" } },
        _count: { select: { musicTracks: true } },
        badges: { select: { id: true } },
      },
    }),
    prisma.profileAlias.count({ where: { profile: { userId: req.userId! } } }),
  ]);

  res.json({
    success: true,
    data: {
      profiles: profiles.map(serializeOwnProfile),
      limits: {
        profiles: getProfileLimit(user),
        aliases: getAliasLimit(user),
      },
      primaryId: profiles.find((p) => p.isPrimary)?.id ?? profiles[0]?.id ?? null,
      aliasCount,
      ownedBadges: user.badges.map((b) => b.id),
    },
  });
});

const createProfileSchema = updateProfileSchema.extend({
  slug: profileSlugSchema,
});

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Error && "code" in err && err.code === "P2002";
}

router.post("/me", requireAuth, async (req, res) => {
  const parsed = createProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: parsed.error.issues[0].message });
  }

  const user = await prisma.user.findUnique({
    where: { id: req.userId! },
    select: { tier: true, profileLimit: true },
  });
  if (!user) {
    return res.status(404).json({ success: false, error: "User not found" });
  }

  if (parsed.data.terminalCommands !== undefined && user.tier === "FREE") {
    return res.status(403).json({ success: false, error: "Custom terminal commands are a PRO feature. Upgrade to add them." });
  }

  const { slug, socialLinks, theme, terminalCommands, countdown, ...rest } = parsed.data;

  try {
    const profile = await prisma.$transaction(async (tx) => {
      const count = await tx.profile.count({ where: { userId: req.userId! } });
      const limit = getProfileLimit(user);
      if (count >= limit) {
        throw new Error("PROFILE_LIMIT_REACHED");
      }

      const created = await tx.profile.create({
        data: {
          userId: req.userId!,
          slug,
          isPrimary: count === 0,
          ...rest,
          socialLinks: toPrismaJson(socialLinks),
          theme: toPrismaJson(theme),
          terminalCommands: toPrismaJson(terminalCommands),
          ...(countdown !== undefined ? { countdown: toPrismaJson(countdown) } : {}),
        },
        include: { aliases: true, badges: { select: { id: true } } },
      });

      await tx.slugNamespace.create({
        data: { slug, kind: "profile", profileId: created.id },
      });
      return created;
    });

    dispatchWebhookEvent(req.userId!, "profile.created", {
      profileId: profile.id,
      slug: profile.slug,
      createdAt: new Date().toISOString(),
    });

    res.status(201).json({ success: true, data: serializeOwnProfile(profile) });
  } catch (err) {
    if (err instanceof Error && err.message === "PROFILE_LIMIT_REACHED") {
      const limit = getProfileLimit(user!);
      return res.status(400).json({
        success: false,
        error: `Profile limit reached (${limit}). Upgrade your plan to create more profiles.`,
      });
    }
    if (isUniqueViolation(err)) {
      return res.status(409).json({ success: false, error: "That profile URL is already taken." });
    }
    throw err;
  }
});

router.put("/me", requireAuth, async (req, res) => {
  const parsed = updateProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: parsed.error.issues[0].message,
    });
  }

  const wantsTerminalCommands = parsed.data.terminalCommands !== undefined;
  if (wantsTerminalCommands) {
    const owner = await prisma.user.findUnique({
      where: { id: req.userId! },
      select: { tier: true },
    });
    if (!owner) return res.status(404).json({ success: false, error: "User not found" });
    if (owner.tier === "FREE") {
      return res.status(403).json({ success: false, error: "Custom terminal commands are a PRO feature. Upgrade to add them." });
    }
  }

  const { socialLinks: rawLinks, theme, countdown, terminalCommands, ...rest } = parsed.data;
  const socialLinks = rawLinks as { platform: string; url: string; label?: string }[] | null | undefined;

  const normalizedLinks = socialLinks?.map((l) => {
    if (l.platform.toLowerCase() === "email" && !l.url.startsWith("mailto:")) {
      return { ...l, url: `mailto:${l.url}` };
    }
    return l;
  });

  const profile = await upsertPrimaryProfile(
    req.userId!,
    {
      ...rest,
      socialLinks: toPrismaJson(normalizedLinks),
      theme: toPrismaJson(theme),
      ...(countdown !== undefined ? { countdown: toPrismaJson(countdown) } : {}),
      ...(terminalCommands !== undefined ? { terminalCommands: toPrismaJson(terminalCommands) } : {}),
    },
    { badges: { select: { id: true } } }
  );

  dispatchWebhookEvent(req.userId!, "profile.updated", {
    profileId: profile.id,
    fields: Object.keys(parsed.data),
    updatedAt: new Date().toISOString(),
  });

  void refreshDiscordPostForProfile(profile.id);

  res.json({ success: true, data: serializeOwnProfile(profile) });
});

router.get("/me/export", requireAuth, requireApiLevel("advanced"), async (req, res) => {
  const format: ExportFormat = req.query.format === "ods" ? "ods" : "xlsx";
  const profile = await prisma.profile.findFirst({ where: profileScope(req.userId!, req.query.profileId) });
  if (!profile) {
    return res.status(404).json({ success: false, error: "Profile not found" });
  }
  const buffer = buildExportBuffer(profileToTransferJson(profile), format);
  const filename = `profile-export.${format === "ods" ? "ods" : "xlsx"}`;
  res.setHeader("Content-Type", EXPORT_CONTENT_TYPES[format]);
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(buffer);
});

router.post("/me/import", requireAuth, requireApiLevel("advanced"), (req, res) => {
  importUpload.single("file")(req, res, async (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({ success: false, error: "File too large (max 5MB)" });
      }
      if (err.code === "LIMIT_UNEXPECTED_FILE") {
        return res.status(400).json({
          success: false,
          error: "Invalid file type. Use .xlsx, .ods, or .csv (no macros).",
        });
      }
      return res.status(400).json({ success: false, error: `Upload error: ${err.message}` });
    }
    if (err) {
      return res.status(500).json({ success: false, error: "Upload failed" });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, error: "No file provided." });
    }

    try {
      const { payload, warnings } = parseImportBuffer(req.file.buffer);
      if (Object.keys(payload).length === 0) {
        return res.status(400).json({ success: false, error: warnings[0] ?? "No importable fields found.", warnings });
      }

      const parsed = updateProfileSchema.safeParse(payload);
      if (!parsed.success) {
        const message = parsed.error.issues[0]?.message ?? "Invalid profile data.";
        return res.status(400).json({ success: false, error: message, warnings });
      }

      const { socialLinks, theme, terminalCommands, countdown, ...rest } = parsed.data;
      const terminalData = terminalCommands !== undefined ? { terminalCommands: toPrismaJson(terminalCommands) } : {};
      const countdownData = countdown !== undefined ? { countdown: toPrismaJson(countdown) } : {};
      const scoped = await prisma.profile.findFirst({ where: profileScope(req.userId!, req.query.profileId) });
      let updatedId: string;
      if (scoped) {
        const updated = await prisma.profile.update({
          where: { id: scoped.id },
          data: {
            ...rest,
            socialLinks: toPrismaJson(normalizeImportedSocialLinks(socialLinks)),
            theme: toPrismaJson(theme),
            ...terminalData,
            ...countdownData,
          },
        });
        updatedId = updated.id;
      } else {
        const updated = await upsertPrimaryProfile(req.userId!, {
          ...rest,
          socialLinks: toPrismaJson(normalizeImportedSocialLinks(socialLinks)),
          theme: toPrismaJson(theme),
          ...terminalData,
          ...countdownData,
        });
        updatedId = updated.id;
      }
      void refreshDiscordPostForProfile(updatedId);

      res.json({ success: true, data: { applied: Object.keys(parsed.data), warnings } });
    } catch {
      res.status(400).json({ success: false, error: "Could not parse the file. Use a .xlsx, .ods, or .csv profile export." });
    }
  });
});

// Shared rules for public handles (mirror the register schema: 3-32 chars,
// lowercase letters/numbers/underscores/hyphens, never a reserved route).
const usernameSchema = z
  .string({ required_error: "Username is required", invalid_type_error: "Username must be text" })
  .min(3, "Username must be at least 3 characters")
  .max(32, "Username must be 32 characters or fewer")
  .regex(/^[a-z0-9_-]+$/, "Username can only contain lowercase letters, numbers, underscores, and hyphens");

export const USERNAME_RENAME_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000; // 30 days between renames

const changeUsernameSchema = z.object({
  username: usernameSchema.refine((u) => !isReservedSlug(u), "That username is reserved"),
});

// Availability oracle for the username editor. It is gated on login + a tight
// per-IP window (so it cannot be used to enumerate registers from outside), and
// handles that are claimed by a *private* profile are reported as available —
// probing must never reveal that an unlisted account exists. The rename route
// always enforces true uniqueness server-side, so claiming such a handle still
// fails with 409 at save time.
router.get("/me/username/availability", requireAuth, async (req, res) => {
  const ip = req.ip ?? "unknown";
  if (usernameCheckRateLimited(ip)) {
    return res.status(429).json({ success: false, error: "Too many requests. Please try again later." });
  }

  const raw = typeof req.query.username === "string" ? req.query.username : "";
  const parsed = usernameSchema.safeParse(raw);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: parsed.error.issues[0].message });
  }
  const username = parsed.data.toLowerCase();

  // A handle is unavailable when it is reserved or already claimed by a public
  // profile/alias *or by another account's username/primary slug*. Claims held
  // by private profiles are invisible to the oracle.
  if (isReservedSlug(username)) {
    return res.json({ success: true, data: { available: false, reason: "reserved" } });
  }

  const [userHit, profileHit, aliasHit] = await Promise.all([
    prisma.user.findFirst({
      where: { username },
      select: { id: true, profiles: { where: { isPrimary: true }, select: { isPublic: true } } },
    }),
    prisma.profile.findFirst({
      where: { slug: username },
      select: { isPublic: true, userId: true },
    }),
    prisma.profileAlias.findUnique({
      where: { slug: username },
      select: { profile: { select: { isPublic: true, userId: true } } },
    }),
  ]);

  const isOwnHandle = (ownerId: string | undefined) => ownerId !== undefined && ownerId === req.userId;

  const publicClaim =
    (userHit && !isOwnHandle(userHit.id) && (userHit.profiles[0]?.isPublic ?? true)) ||
    (profileHit && !isOwnHandle(profileHit.userId) && profileHit.isPublic) ||
    (aliasHit && !isOwnHandle(aliasHit.profile.userId) && aliasHit.profile.isPublic);
  const ownClaim =
    (userHit && isOwnHandle(userHit.id)) ||
    (profileHit && isOwnHandle(profileHit.userId)) ||
    (aliasHit && isOwnHandle(aliasHit.profile.userId));

  return res.json({
    success: true,
    data: {
      available: !publicClaim,
      reason: publicClaim ? "taken" : ownClaim ? "current" : "available",
    },
  });
});

// Rename the account's @username. The handle, the primary profile's public URL
// and the shared slug namespace move together in one transaction. The *old*
// slug becomes an automatic alias of the primary profile, so links already
// shared keep resolving; it is released exactly like a regular alias when the
// owner deletes it. Restricted to logged-in owners, rate-limited per IP and
// capped at one rename every 30 days.
router.patch("/me/username", requireAuth, async (req, res) => {
  const ip = req.ip ?? "unknown";
  if (usernameRenameRateLimited(ip)) {
    return res.status(429).json({ success: false, error: "Too many requests. Please try again later." });
  }

  const parsed = changeUsernameSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: parsed.error.issues[0].message });
  }
  const newUsername = parsed.data.username.toLowerCase();

  const user = await prisma.user.findUnique({
    where: { id: req.userId! },
    select: { id: true, username: true, lastUsernameChangeAt: true },
  });
  if (!user) {
    return res.status(404).json({ success: false, error: "User not found" });
  }

  if (newUsername === user.username) {
    return res.status(400).json({ success: false, error: "That is already your username." });
  }

  // 30-day cooldown between renames.
  const now = new Date();
  if (user.lastUsernameChangeAt) {
    const elapsed = now.getTime() - user.lastUsernameChangeAt.getTime();
    if (elapsed < USERNAME_RENAME_COOLDOWN_MS) {
      const waitDays = Math.ceil((USERNAME_RENAME_COOLDOWN_MS - elapsed) / (24 * 60 * 60 * 1000));
      return res.status(429).json({
        success: false,
        error: `You changed your username recently. Please wait ${waitDays} more day${waitDays === 1 ? "" : "s"}.`,
      });
    }
  }

  const primary = await prisma.profile.findFirst({
    where: { userId: req.userId!, isPrimary: true },
    select: { id: true, slug: true },
  });

  try {
    await prisma.$transaction(async (tx) => {
      const oldSlug = primary?.slug ?? user.username;

      // Move the user's handle...
      await tx.user.update({
        where: { id: user.id },
        data: { username: newUsername, lastUsernameChangeAt: now },
      });

      // ...the primary profile's public URL (when one exists)...
      if (primary) {
        await tx.profile.update({ where: { id: primary.id }, data: { slug: newUsername } });

        // ...and the shared slug namespace: the old primary slug becomes an
        // alias of this profile (redirect), the new slug is claimed by it.
        if (oldSlug !== newUsername) {
          await tx.slugNamespace.deleteMany({ where: { slug: oldSlug, kind: "profile" } });
          await tx.profileAlias.create({ data: { profileId: primary.id, slug: oldSlug } });
          await tx.slugNamespace.create({ data: { slug: oldSlug, kind: "alias", profileId: primary.id } });
        }
        await tx.slugNamespace.create({ data: { slug: newUsername, kind: "profile", profileId: primary.id } });
      }

      // Sessions survive (JWTs carry userId only); the old username simply
      // stops working as a login identifier.
    });

    void refreshDiscordPostForProfile(primary ? primary.id : "").catch(() => undefined);
    dispatchWebhookEvent(req.userId!, "username.changed", {
      userId: req.userId!,
      oldUsername: user.username,
      newUsername,
      changedAt: now.toISOString(),
    });

    res.status(200).json({
      success: true,
      data: { username: newUsername, slug: primary ? newUsername : user.username, lastUsernameChangeAt: now.toISOString() },
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return res.status(409).json({ success: false, error: "That username is already taken." });
    }
    throw err;
  }
});

router.get("/me/:profileId", requireAuth, async (req: Request<{ profileId: string }>, res) => {
  const profile = await prisma.profile.findFirst({
    where: { id: req.params.profileId, userId: req.userId! },
    include: {
      aliases: { orderBy: { createdAt: "asc" } },
      musicTracks: { orderBy: { position: "asc" } },
      badges: { select: { id: true } },
    },
  });

  if (!profile) {
    return res.status(404).json({ success: false, error: "Profile not found" });
  }

  res.json({ success: true, data: serializeOwnProfile(profile) });
});

router.patch("/me/:profileId", requireAuth, async (req: Request<{ profileId: string }>, res) => {
  const parsed = updateProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: parsed.error.issues[0].message });
  }

  const wantsTerminalCommands = parsed.data.terminalCommands !== undefined;
  if (wantsTerminalCommands) {
    const owner = await prisma.user.findUnique({
      where: { id: req.userId! },
      select: { tier: true },
    });
    if (!owner) return res.status(404).json({ success: false, error: "User not found" });
    if (owner.tier === "FREE") {
      return res.status(403).json({ success: false, error: "Custom terminal commands are a PRO feature. Upgrade to add them." });
    }
  }

  const profile = await prisma.profile.findFirst({
    where: { id: req.params.profileId, userId: req.userId! },
  });
  if (!profile) {
    return res.status(404).json({ success: false, error: "Profile not found" });
  }

  const { slug, socialLinks, theme, terminalCommands, countdown, ...rest } = parsed.data;

  if (slug && profile.isPrimary) {
    return res.status(400).json({ success: false, error: "Your main profile URL cannot be renamed." });
  }

  try {
    const updated = await prisma.profile.update({
      where: { id: profile.id },
      data: {
        ...(slug ? { slug } : {}),
        ...rest,
        socialLinks: toPrismaJson(socialLinks),
        theme: toPrismaJson(theme),
        ...(countdown !== undefined ? { countdown: toPrismaJson(countdown) } : {}),
        ...(terminalCommands !== undefined ? { terminalCommands: toPrismaJson(terminalCommands) } : {}),
      },
      include: { badges: { select: { id: true } } },
    });
    void refreshDiscordPostForProfile(updated.id);
    res.json({ success: true, data: serializeOwnProfile(updated) });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return res.status(409).json({ success: false, error: "That profile URL is already taken." });
    }
    throw err;
  }
});

router.delete("/me/avatar", requireAuth, async (req, res) => {
  const profile = await prisma.profile.findFirst({
    where: profileScope(req.userId!, req.query.profileId),
    select: { id: true, avatar: true },
  });

  if (!profile) {
    return res.status(404).json({ success: false, error: "Profile not found" });
  }

  if (profile.avatar) {
    void deleteUpload(path.basename(profile.avatar)).catch(() => undefined);
  }

  await prisma.profile.update({ where: { id: profile.id }, data: { avatar: null } });
  void refreshDiscordPostForProfile(profile.id);

  res.json({ success: true });
});

router.delete("/me/banner", requireAuth, async (req, res) => {
  const profile = await prisma.profile.findFirst({
    where: profileScope(req.userId!, req.query.profileId),
    select: { id: true, banner: true },
  });
  if (!profile) {
    return res.status(404).json({ success: false, error: "Profile not found" });
  }

  if (profile.banner) {
    void deleteUpload(path.basename(profile.banner)).catch(() => undefined);
  }

  await prisma.profile.update({ where: { id: profile.id }, data: { banner: null } });
  void refreshDiscordPostForProfile(profile.id);

  res.json({ success: true });
});

router.delete("/me/background", requireAuth, async (req, res) => {
  const profile = await prisma.profile.findFirst({
    where: profileScope(req.userId!, req.query.profileId),
    select: { id: true, theme: true },
  });
  if (!profile) {
    return res.status(404).json({ success: false, error: "Profile not found" });
  }

  const theme = profile.theme && typeof profile.theme === "object" ? { ...(profile.theme as Record<string, unknown>) } : {};
  const oldBg = typeof theme.backgroundImage === "string" ? theme.backgroundImage : null;

  delete theme.backgroundImage;
  await prisma.profile.update({
    where: { id: profile.id },
    data: { theme: toPrismaJson(theme) },
  });
  void refreshDiscordPostForProfile(profile.id);

  if (oldBg && oldBg.startsWith("/uploads/")) {
    void deleteUpload(path.basename(oldBg)).catch(() => undefined);
  }

  res.json({ success: true });
});

router.delete("/me/:profileId", requireAuth, async (req: Request<{ profileId: string }>, res) => {
  const profile = await prisma.profile.findFirst({
    where: { id: req.params.profileId, userId: req.userId! },
    include: { musicTracks: { select: { filePath: true } }, products: { select: { id: true, filePath: true, previewImage: true } } },
  });
  if (!profile) {
    return res.status(404).json({ success: false, error: "Profile not found" });
  }

  const count = await prisma.profile.count({ where: { userId: req.userId! } });
  if (count <= 1) {
    return res.status(400).json({ success: false, error: "You must keep at least one profile." });
  }

  const storageDir = getEnv().LOCAL_STORAGE_PATH;
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
  for (const product of profile.products) {
    if (product.filePath) void deleteProductUpload(path.basename(product.filePath)).catch(() => undefined);
    if (product.previewImage) void deleteUpload(path.basename(product.previewImage)).catch(() => undefined);
  }

  await prisma.$transaction(async (tx) => {
    if (profile.isPrimary) {
      const next = await tx.profile.findFirst({
        where: { userId: req.userId!, id: { not: profile.id } },
        orderBy: { createdAt: "asc" },
      });
      if (next) {
        await tx.profile.update({ where: { id: next.id }, data: { isPrimary: true } });
      }
    }
    await tx.profile.delete({ where: { id: profile.id } });
  });

  dispatchWebhookEvent(req.userId!, "profile.deleted", {
    profileId: profile.id,
    slug: profile.slug,
    deletedAt: new Date().toISOString(),
  });

  res.json({ success: true });
});

router.post("/me/:profileId/primary", requireAuth, async (req: Request<{ profileId: string }>, res) => {
  const profile = await prisma.profile.findFirst({
    where: { id: req.params.profileId, userId: req.userId! },
  });
  if (!profile) {
    return res.status(404).json({ success: false, error: "Profile not found" });
  }

  await prisma.$transaction([
    prisma.profile.updateMany({ where: { userId: req.userId! }, data: { isPrimary: false } }),
    prisma.profile.update({ where: { id: profile.id }, data: { isPrimary: true } }),
  ]);

  res.json({ success: true });
});

router.get("/me/:profileId/aliases", requireAuth, async (req: Request<{ profileId: string }>, res) => {
  const profile = await prisma.profile.findFirst({
    where: { id: req.params.profileId, userId: req.userId! },
  });
  if (!profile) {
    return res.status(404).json({ success: false, error: "Profile not found" });
  }

  const aliases = await prisma.profileAlias.findMany({
    where: { profileId: profile.id },
    orderBy: { createdAt: "asc" },
  });
  res.json({ success: true, data: aliases });
});

const createAliasSchema = z.object({
  slug: profileSlugSchema,
});

router.post("/me/:profileId/aliases", requireAuth, async (req: Request<{ profileId: string }>, res) => {
  const parsed = createAliasSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: parsed.error.issues[0].message });
  }

  const profile = await prisma.profile.findFirst({
    where: { id: req.params.profileId, userId: req.userId! },
  });
  if (!profile) {
    return res.status(404).json({ success: false, error: "Profile not found" });
  }

  const user = await prisma.user.findUnique({
    where: { id: req.userId! },
    select: { tier: true, aliasLimit: true },
  });
  if (!user) {
    return res.status(404).json({ success: false, error: "User not found" });
  }

  const count = await prisma.profileAlias.count({ where: { profile: { userId: req.userId! } } });
  const limit = getAliasLimit(user);
  if (count >= limit) {
    return res.status(400).json({
      success: false,
      error: `Alias limit reached (${limit}). Upgrade your plan to create more aliases.`,
    });
  }

  if (isReservedSlug(parsed.data.slug)) {
    return res.status(400).json({ success: false, error: "That alias is a reserved route." });
  }

  const clash = await prisma.profile.findUnique({ where: { slug: parsed.data.slug } });
  if (clash) {
    return res.status(409).json({ success: false, error: "That alias is already taken." });
  }

  try {
    const alias = await prisma.$transaction(async (tx) => {
      await tx.slugNamespace.create({
        data: { slug: parsed.data.slug, kind: "alias", profileId: profile.id },
      });
      return tx.profileAlias.create({
        data: { profileId: profile.id, slug: parsed.data.slug },
      });
    });
    res.status(201).json({ success: true, data: alias });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return res.status(409).json({ success: false, error: "That alias is already taken." });
    }
    throw err;
  }
});

router.delete("/me/:profileId/aliases/:aliasId", requireAuth, async (req: Request<{ profileId: string; aliasId: string }>, res) => {
  const profile = await prisma.profile.findFirst({
    where: { id: req.params.profileId, userId: req.userId! },
  });
  if (!profile) {
    return res.status(404).json({ success: false, error: "Profile not found" });
  }

  const alias = await prisma.profileAlias.findFirst({
    where: { id: req.params.aliasId, profileId: profile.id },
  });
  if (!alias) {
    return res.status(404).json({ success: false, error: "Alias not found" });
  }

  await prisma.$transaction(async (tx) => {
    // Release the slug so it can be claimed again, then remove the alias.
    await tx.slugNamespace.deleteMany({ where: { slug: alias.slug, kind: "alias" } });
    await tx.profileAlias.delete({ where: { id: alias.id } });
  });
  res.json({ success: true });
});

const badgeToggleSchema = z.object({
  badge: z.string().uuid(),
  enabled: z.boolean(),
});

router.post("/me/:profileId/badges", requireAuth, async (req: Request<{ profileId: string }>, res) => {
  const parsed = badgeToggleSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: parsed.error.issues[0].message });
  }

  const [profile, user] = await Promise.all([
    prisma.profile.findFirst({
      where: { id: req.params.profileId, userId: req.userId! },
      include: { badges: true },
    }),
    prisma.user.findUnique({ where: { id: req.userId! }, include: { badges: true } }),
  ]);
  if (!profile) {
    return res.status(404).json({ success: false, error: "Profile not found" });
  }
  if (!user) {
    return res.status(404).json({ success: false, error: "User not found" });
  }
  if (!user.badges.some((b) => b.id === parsed.data.badge)) {
    return res.status(403).json({ success: false, error: "You don't have this badge." });
  }

  const current = profile.badges.map((b) => b.id);
  const has = current.includes(parsed.data.badge);
  const next = parsed.data.enabled
    ? has
      ? current
      : [...current, parsed.data.badge]
    : current.filter((id) => id !== parsed.data.badge);

  const updated = await prisma.profile.update({
    where: { id: profile.id },
    data: { badges: { set: next.map((id) => ({ id })) } },
    select: { badges: { select: { id: true } } },
  });

  res.json({ success: true, data: { badges: orderBadges(updated.badges, profile.badgeOrder).map((b) => b.id) } });
});

const badgeOrderSchema = z
  .object({
    order: z.array(z.string().uuid()).max(50),
  })
  .refine((data) => new Set(data.order).size === data.order.length, {
    message: "Badge order cannot contain duplicates",
  });

router.put("/me/:profileId/badges/order", requireAuth, async (req: Request<{ profileId: string }>, res) => {
  const parsed = badgeOrderSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: parsed.error.issues[0].message });
  }

  const profile = await prisma.profile.findFirst({
    where: { id: req.params.profileId, userId: req.userId! },
    select: { id: true, badges: { select: { id: true } } },
  });
  if (!profile) {
    return res.status(404).json({ success: false, error: "Profile not found" });
  }

  const owned = new Set(profile.badges.map((b) => b.id));
  if (parsed.data.order.some((id) => !owned.has(id))) {
    return res.status(400).json({
      success: false,
      error: "Badge order can only include badges on this profile",
    });
  }

  await prisma.profile.update({
    where: { id: profile.id },
    data: { badgeOrder: parsed.data.order },
  });

  res.json({
    success: true,
    data: { badges: orderBadges(profile.badges, parsed.data.order).map((b) => b.id) },
  });
});

router.post("/me/avatar", requireAuth, handleUpload("avatar"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, error: "No file uploaded" });
  }

  const ext = path.extname(req.file.originalname).toLowerCase();
  if (!validateFileMagic(req.file.path, ext)) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ success: false, error: "Invalid file type. Use JPEG, PNG, GIF, or WebP." });
  }

  const profile = await prisma.profile.findFirst({ where: profileScope(req.userId!, req.query.profileId) });
  if (!profile) {
    await fs.promises.unlink(req.file.path).catch(() => undefined);
    return res.status(404).json({ success: false, error: "Profile not found" });
  }

  await writeUpload(req.file.filename, { contentType: req.file.mimetype });

  const filePath = `/uploads/${req.file.filename}`;
  await prisma.profile.update({ where: { id: profile.id }, data: { avatar: filePath } });
  void refreshDiscordPostForProfile(profile.id);

  res.json({ success: true, data: { avatar: filePath } });
});

router.post("/me/banner", requireAuth, handleUpload("banner"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, error: "No file uploaded" });
  }

  const ext = path.extname(req.file.originalname).toLowerCase();
  if (!validateFileMagic(req.file.path, ext)) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ success: false, error: "Invalid file type. Use JPEG, PNG, GIF, or WebP." });
  }

  const profile = await prisma.profile.findFirst({ where: profileScope(req.userId!, req.query.profileId) });
  if (!profile) {
    await fs.promises.unlink(req.file.path).catch(() => undefined);
    return res.status(404).json({ success: false, error: "Profile not found" });
  }

  await writeUpload(req.file.filename, { contentType: req.file.mimetype });

  const filePath = `/uploads/${req.file.filename}`;
  await prisma.profile.update({ where: { id: profile.id }, data: { banner: filePath } });
  void refreshDiscordPostForProfile(profile.id);

  res.json({ success: true, data: { banner: filePath } });
});

router.post("/me/link-icon", requireAuth, handleUpload("linkIcon"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, error: "No file uploaded" });
  }

  const ext = path.extname(req.file.originalname).toLowerCase();
  if (!validateFileMagic(req.file.path, ext)) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ success: false, error: "Invalid file type. Use JPEG, PNG, GIF, or WebP." });
  }

  await writeUpload(req.file.filename, { contentType: req.file.mimetype });

  const filePath = `/uploads/${req.file.filename}`;
  res.json({ success: true, data: { image: filePath } });
});

router.post("/me/background", requireAuth, handleBackgroundUpload("background"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, error: "No file uploaded" });
  }

  const ext = path.extname(req.file.originalname).toLowerCase();
  if (!validateFileMagic(req.file.path, ext)) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ success: false, error: "Invalid file type. Use JPEG, PNG, GIF, or WebP." });
  }

  const profile = await prisma.profile.findFirst({ where: profileScope(req.userId!, req.query.profileId) });
  if (!profile) {
    await fs.promises.unlink(req.file.path).catch(() => undefined);
    return res.status(404).json({ success: false, error: "Profile not found" });
  }

  const theme = (profile.theme && typeof profile.theme === "object" ? profile.theme : {}) as Record<string, unknown>;
  const oldBg = typeof theme.backgroundImage === "string" ? theme.backgroundImage : null;

  await writeUpload(req.file.filename, { contentType: req.file.mimetype });

  const filePath = `/uploads/${req.file.filename}`;
  await prisma.profile.update({
    where: { id: profile.id },
    data: { theme: { ...theme, backgroundImage: filePath } },
  });
  void refreshDiscordPostForProfile(profile.id);

  if (oldBg && oldBg.startsWith("/uploads/")) {
    void deleteUpload(path.basename(oldBg)).catch(() => undefined);
  }

  res.json({ success: true, data: { backgroundImage: filePath } });
});

const IMPORT_EXTS = new Set([".xlsx", ".ods", ".csv"]);

const importUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (IMPORT_EXTS.has(ext)) {
      cb(null, true);
    } else {
      cb(new multer.MulterError("LIMIT_UNEXPECTED_FILE", file.fieldname));
    }
  },
});

router.get("/:username/og.png", publicRateLimit, async (req: Request<{ username: string }>, res) => {
  const result = await renderProfileOgCached(req.params.username);
  if (!result) {
    return res.status(404).end();
  }
  if (req.headers["if-none-match"] === result.etag) {
    return res.status(304).end();
  }
  res.setHeader("Content-Type", "image/png");
  res.setHeader("ETag", result.etag);
  res.setHeader("Cache-Control", "public, max-age=300");
  res.send(result.buffer);
});

router.get("/:identifier/presence", publicRateLimit, async (req: Request<{ identifier: string }>, res) => {
  const profileId = await resolveProfileId(req.params.identifier);
  if (!profileId) {
    return res.status(404).json({ success: false, error: "Profile not found" });
  }

  const profile = await prisma.profile.findUnique({
    where: { id: profileId },
    select: {
      isPublic: true,
      showDiscordPresence: true,
      showDiscordActivity: true,
      discordConnection: { select: { discordId: true } },
    },
  });

  if (!profile || !profile.isPublic) {
    return res.status(404).json({ success: false, error: "Profile not found" });
  }

  if (!profile.showDiscordPresence || !profile.discordConnection) {
    return res.json({ success: true, data: null });
  }

  const presence = getCachedPresence(profile.discordConnection.discordId);
  const status = presence?.status ?? "offline";
  const described = describeActivities(profile.showDiscordActivity ? presence?.activities ?? [] : []);
  return res.json({
    success: true,
    data: {
      status,
      statusLabel: DISCORD_STATUS_LABELS[status] ?? status,
      activities: profile.showDiscordActivity ? presence?.activities ?? [] : [],
      line: described.line,
      customStatus: described.customStatus,
      updatedAt: presence?.updatedAt ?? null,
    },
  });
});

router.get("/:identifier", publicRateLimit, async (req: Request<{ identifier: string }>, res) => {
  const viewerId = getViewerId(req);
  const identifier = req.params.identifier;

  const profileId = await resolveProfileId(identifier);
  if (!profileId) {
    return res.status(404).json({ success: false, error: "Profile not found" });
  }

  const profile = await prisma.profile.findUnique({
    where: { id: profileId },
    include: {
      user: { select: { id: true, username: true, createdAt: true } },
      musicTracks: { orderBy: { position: "asc" } },
      products: {
        where: { enabled: true },
        orderBy: { createdAt: "asc" },
        select: { id: true, title: true, description: true, type: true, priceCents: true, previewImage: true, createdAt: true },
      },
      discordConnection: {
        select: { discordId: true, username: true, globalName: true, avatar: true },
      },
      badges: { select: { id: true } },
    },
  });

  if (!profile) {
    return res.status(404).json({ success: false, error: "Profile not found" });
  }

  if (!profile.isPublic && profile.userId !== viewerId) {
    return res.status(404).json({ success: false, error: "Profile not found" });
  }

  let discord: unknown = null;
  if (profile.showDiscordPresence && profile.discordConnection) {
    const presence = getCachedPresence(profile.discordConnection.discordId);
    const status = presence?.status ?? "offline";
    const described = describeActivities(profile.showDiscordActivity ? presence?.activities ?? [] : []);
    discord = {
      username: profile.discordConnection.username,
      globalName: profile.discordConnection.globalName,
      avatar: buildDiscordAvatarUrl(profile.discordConnection.discordId, profile.discordConnection.avatar),
      presence: {
        status,
        statusLabel: DISCORD_STATUS_LABELS[status] ?? status,
        activities: profile.showDiscordActivity ? presence?.activities ?? [] : [],
        line: described.line,
        customStatus: described.customStatus,
        updatedAt: presence?.updatedAt ?? null,
      },
    };
  }

  if (profile.userId !== viewerId) {
    const ip = getClientIp(req);
    const ua = req.headers["user-agent"] || null;
    const cookies = parseCookies(req.headers.cookie);

    // Anonymous analytics (page views + the bp_vid visitor cookie) are a
    // non-essential cookie under ePrivacy/GDPR, so they only run once the
    // visitor has accepted non-essential cookies via the consent banner
    // (bp_consent=accept). Essential cookies (AUTH_COOKIE, rate-limit/blacklist)
    // are always set independent of this. Do Not Track / Global Privacy Control
    // signals opt the visitor out even when they previously accepted.
    const analyticsConsent = analyticsAllowed(req.headers);

    const rawReferer =
      (Array.isArray(req.headers["referer"]) ? req.headers["referer"][0] : req.headers["referer"]) ??
      (Array.isArray(req.headers["referrer"]) ? req.headers["referrer"][0] : req.headers["referrer"]) ??
      null;
    const referer = rawReferer ? stripHtml(rawReferer) || null : null;

    let bpVid = "";
    if (analyticsConsent) {
      bpVid = cookies["bp_vid"] || crypto.randomBytes(16).toString("hex");
      const visitorId = crypto.createHash("sha256").update(`${ip}|${ua}|${bpVid}`).digest("hex").slice(0, 32);

      prisma.pageView.create({
        data: {
          profileId: profile.id,
          ip,
          userAgent: ua,
          visitorId,
          referer,
        },
      }).catch(() => {});

      const oneYear = 365 * 24 * 60 * 60 * 1000;
      res.cookie("bp_vid", bpVid, {
        maxAge: oneYear,
        httpOnly: true,
        sameSite: "lax",
        path: "/",
      });
    }

    if (profile.notifyOnView && !emailNotifyRateLimited(profile.id, "view")) {
      import("../lib/email.js").then(({ isEmailEnabled, sendEmail, buildViewNotification }) => {
        if (isEmailEnabled()) {
          prisma.user.findUnique({ where: { id: profile.userId }, select: { email: true } }).then((owner) => {
            if (owner?.email) {
              sendEmail({
                to: owner.email,
                subject: `Someone viewed your profile`,
                html: buildViewNotification({
                  appName: getEnv().SMTP_FROM_NAME || "BioPlatform",
                  profileUrl: `${getEnv().APP_URL || "http://localhost:80"}/${profile.slug}`,
                  viewerIp: ip ?? undefined,
                }),
              }).catch(() => {});
            }
          }).catch(() => {});
        }
      }).catch(() => {});
    }

    dispatchWebhookEvent(profile.userId, "profile.viewed", {
      profileId: profile.id,
      username: profile.user.username,
      referer: referer ?? null,
      viewedAt: new Date().toISOString(),
    });
  }

  // Resolve the active seasonal theme (if any) for this profile, honoring the
  // user's decoration preference toggles and the admin's configuration.
  const seasonal = await resolveProfileSeasonalTheme(profile);

  const body = {
    success: true,
    data: {
      requestedSlug: identifier,
      slug: profile.slug,
      isPrimary: profile.isPrimary,
      badges: orderBadges(profile.badges, profile.badgeOrder).map((b) => b.id),
      username: profile.user.username,
      createdAt: profile.user.createdAt,
      id: profile.id,
      userId: profile.userId,
      displayName: profile.displayName,
      bio: profile.bio,
      avatar: profile.avatar,
      banner: profile.banner,
      location: profile.location,
      website: profile.website,
      socialLinks: profile.socialLinks,
      presenceStatus: profile.presenceStatus,
      countdown: profile.countdown,
      newsletterVisible: profile.newsletterVisible,
      newsletterHeading: profile.newsletterHeading,
      tipsEnabled: profile.tipsEnabled,
      tipsHeading: profile.tipsHeading,
      tipsBtcAddress: profile.tipsEnabled ? profile.tipsBtcAddress : null,
      tipsLtcAddress: profile.tipsEnabled ? profile.tipsLtcAddress : null,
      shopDiscountPercent: profile.shopDiscountPercent,
      products: profile.products,
      theme: profile.theme,
      terminalCommands: profile.terminalCommands,
      seasonal,
      theming: seasonal,
      isPublic: profile.isPublic,
      musicTracks: profile.musicTracks,
      discord,
      updatedAt: profile.updatedAt,
    },
  };
  const etag = contentEtag(body);
  res.setHeader("ETag", etag);
  res.setHeader("Cache-Control", "no-cache");
  if (clientHasFreshBody(req, etag)) {
    return res.status(304).end();
  }
  res.json(body);
});

const clickSchema = z.object({
  profileId: z.string().uuid(),
  platform: z.string(),
  slug: z.string().max(64).optional(),
});

router.post("/click", publicRateLimit, async (req, res) => {
  const parsed = clickSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: "Invalid request" });
  }
  const { profileId, platform, slug } = parsed.data;
  const platformLower = platform.toLowerCase();
  if (!ALLOWED_PLATFORMS.has(platformLower)) {
    return res.status(400).json({ success: false, error: "Unsupported platform" });
  }

  const viewerId = getViewerId(req);

  const profile = await prisma.profile.findUnique({
    where: { id: profileId },
    select: { userId: true, notifyOnClick: true, isPublic: true, socialLinks: true },
  });

  if (!profile) {
    return res.status(404).json({ success: false, error: "Profile not found" });
  }

  if (!profile.isPublic && profile.userId !== viewerId) {
    return res.status(404).json({ success: false, error: "Profile not found" });
  }

  const socialLinks = Array.isArray(profile.socialLinks)
    ? (profile.socialLinks as { platform: string; url: string }[])
    : [];
  if (!socialLinks.some((l) => String(l.platform).toLowerCase() === platformLower)) {
    return res.status(400).json({ success: false, error: "Platform not found on this profile" });
  }

  if (profileClickRateLimited(profileId)) {
    return res.status(429).json({ success: false, error: "Too many requests. Please try again later." });
  }

  if (profile.userId !== viewerId) {
    const ip = getClientIp(req);
    const ua = req.headers["user-agent"] || null;
    const visitorId = getVisitorId(req);

    // Link clicks feed the same analytics; keep them consistent with page
    // views and honour consent + Do Not Track / Global Privacy Control.
    if (analyticsAllowed(req.headers)) {
      prisma.linkClick.create({
        data: {
          profileId,
          platform: platformLower,
          slug: slug ? stripHtml(slug).slice(0, 64) || null : null,
          ip,
          userAgent: ua,
          visitorId,
        },
      }).catch(() => {});
    }

    if (profile.notifyOnClick && !emailNotifyRateLimited(profileId, "click")) {
      import("../lib/email.js").then(({ isEmailEnabled, sendEmail, buildClickNotification }) => {
        if (isEmailEnabled()) {
          prisma.user.findUnique({ where: { id: profile.userId }, select: { email: true, username: true } }).then((owner) => {
            if (owner?.email) {
              sendEmail({
                to: owner.email,
                subject: `Someone clicked your ${platform} link`,
                html: buildClickNotification({
                  appName: getEnv().SMTP_FROM_NAME || "BioPlatform",
                  platform,
                  profileUrl: `${getEnv().APP_URL || "http://localhost:80"}/${owner.username}`,
                }),
              }).catch(() => {});
            }
          }).catch(() => {});
        }
      }).catch(() => {});
    }

    dispatchWebhookEvent(profile.userId, "link.clicked", {
      profileId,
      platform: platformLower,
      clickedAt: new Date().toISOString(),
    });
  }

  res.json({ success: true });
});

export default router;
