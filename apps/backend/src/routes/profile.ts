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

function parseCookies(header: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!header) return cookies;
  for (const pair of header.split(";")) {
    const idx = pair.indexOf("=");
    if (idx === -1) continue;
    const key = pair.slice(0, idx).trim();
    const val = pair.slice(idx + 1).trim();
    if (!key) continue;
    try {
      cookies[key] = decodeURIComponent(val);
    } catch {
      cookies[key] = val;
    }
  }
  return cookies;
}

function serializeOwnProfile<T extends Record<string, unknown> & { badges?: { id: string }[] }>(profile: T) {
  return { ...profile, badges: (profile.badges ?? []).map((b) => b.id) };
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

  const count = await prisma.profile.count({ where: { userId: req.userId! } });
  const limit = getProfileLimit(user);
  if (count >= limit) {
    return res.status(400).json({
      success: false,
      error: `Profile limit reached (${limit}). Upgrade your plan to create more profiles.`,
    });
  }

  const { slug, socialLinks, theme, ...rest } = parsed.data;

  try {
    const profile = await prisma.profile.create({
      data: {
        userId: req.userId!,
        slug,
        isPrimary: count === 0,
        ...rest,
        socialLinks: toPrismaJson(socialLinks),
        theme: toPrismaJson(theme),
      },
      include: { aliases: true, badges: { select: { id: true } } },
    });

    dispatchWebhookEvent(req.userId!, "profile.created", {
      profileId: profile.id,
      slug: profile.slug,
      createdAt: new Date().toISOString(),
    });

    res.status(201).json({ success: true, data: serializeOwnProfile(profile) });
  } catch (err) {
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

  const { socialLinks: rawLinks, theme, ...rest } = parsed.data;
  const socialLinks = rawLinks as { platform: string; url: string }[] | null | undefined;

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

  const profile = await prisma.profile.findFirst({
    where: { id: req.params.profileId, userId: req.userId! },
  });
  if (!profile) {
    return res.status(404).json({ success: false, error: "Profile not found" });
  }

  const { slug, socialLinks, theme, ...rest } = parsed.data;

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

router.delete("/me/:profileId", requireAuth, async (req: Request<{ profileId: string }>, res) => {
  const profile = await prisma.profile.findFirst({
    where: { id: req.params.profileId, userId: req.userId! },
    include: { musicTracks: { select: { filePath: true } } },
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

  const clash = await prisma.profile.findUnique({ where: { slug: parsed.data.slug } });
  if (clash) {
    return res.status(409).json({ success: false, error: "That alias is already taken." });
  }

  try {
    const alias = await prisma.profileAlias.create({
      data: { profileId: profile.id, slug: parsed.data.slug },
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

  await prisma.profileAlias.delete({ where: { id: alias.id } });
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

  res.json({ success: true, data: { badges: updated.badges.map((b) => b.id) } });
});

router.post("/me/avatar", requireAuth, handleUpload("avatar"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, error: "No file uploaded" });
  }

  const profile = await prisma.profile.findFirst({ where: profileScope(req.userId!, req.query.profileId) });
  if (!profile) {
    fs.unlinkSync(req.file.path);
    return res.status(404).json({ success: false, error: "Profile not found" });
  }

  const filePath = `/uploads/${req.file.filename}`;
  await prisma.profile.update({ where: { id: profile.id }, data: { avatar: filePath } });
  void refreshDiscordPostForProfile(profile.id);

  res.json({ success: true, data: { avatar: filePath } });
});

router.post("/me/banner", requireAuth, handleUpload("banner"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, error: "No file uploaded" });
  }

  const profile = await prisma.profile.findFirst({ where: profileScope(req.userId!, req.query.profileId) });
  if (!profile) {
    fs.unlinkSync(req.file.path);
    return res.status(404).json({ success: false, error: "Profile not found" });
  }

  const filePath = `/uploads/${req.file.filename}`;
  await prisma.profile.update({ where: { id: profile.id }, data: { banner: filePath } });
  void refreshDiscordPostForProfile(profile.id);

  res.json({ success: true, data: { banner: filePath } });
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
    const filePath = path.resolve(getEnv().LOCAL_STORAGE_PATH, path.basename(profile.avatar));
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
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
    const filePath = path.resolve(getEnv().LOCAL_STORAGE_PATH, path.basename(profile.banner));
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }

  await prisma.profile.update({ where: { id: profile.id }, data: { banner: null } });
  void refreshDiscordPostForProfile(profile.id);

  res.json({ success: true });
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

      const { socialLinks, theme, ...rest } = parsed.data;
      const scoped = await prisma.profile.findFirst({ where: profileScope(req.userId!, req.query.profileId) });
      let updatedId: string;
      if (scoped) {
        const updated = await prisma.profile.update({
          where: { id: scoped.id },
          data: {
            ...rest,
            socialLinks: toPrismaJson(normalizeImportedSocialLinks(socialLinks)),
            theme: toPrismaJson(theme),
          },
        });
        updatedId = updated.id;
      } else {
        const updated = await upsertPrimaryProfile(req.userId!, {
          ...rest,
          socialLinks: toPrismaJson(normalizeImportedSocialLinks(socialLinks)),
          theme: toPrismaJson(theme),
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
    const bpVid = cookies["bp_vid"] || crypto.randomBytes(16).toString("hex");
    const rawReferer =
      (Array.isArray(req.headers["referer"]) ? req.headers["referer"][0] : req.headers["referer"]) ??
      (Array.isArray(req.headers["referrer"]) ? req.headers["referrer"][0] : req.headers["referrer"]) ??
      null;
    const referer = rawReferer ? stripHtml(rawReferer) || null : null;

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

    if (profile.notifyOnView) {
      import("../lib/email.js").then(({ isEmailEnabled, sendEmail, buildViewNotification }) => {
        if (isEmailEnabled()) {
          prisma.user.findUnique({ where: { id: profile.userId }, select: { email: true } }).then((owner) => {
            if (owner?.email) {
              sendEmail({
                to: owner.email,
                subject: `Someone viewed your profile`,
                html: buildViewNotification({
                  appName: process.env.SMTP_FROM_NAME || "BioPlatform",
                  profileUrl: `${process.env.APP_URL || "http://localhost:80"}/${profile.slug}`,
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

    const oneYear = 365 * 24 * 60 * 60 * 1000;
    res.cookie("bp_vid", bpVid, {
      maxAge: oneYear,
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    });
  }

  const body = {
    success: true,
    data: {
      requestedSlug: identifier,
      slug: profile.slug,
      isPrimary: profile.isPrimary,
      badges: profile.badges.map((b) => b.id),
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
      theme: profile.theme,
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

router.post("/click", publicRateLimit, async (req, res) => {
  const { profileId, platform } = req.body as { profileId?: string; platform?: string };
  if (!profileId || !platform) {
    return res.status(400).json({ success: false, error: "profileId and platform are required" });
  }

  const platformLower = String(platform).toLowerCase();
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

    prisma.linkClick.create({
      data: {
        profileId,
        platform: platformLower,
        ip,
        userAgent: ua,
        visitorId,
      },
    }).catch(() => {});

    if (profile.notifyOnClick) {
      import("../lib/email.js").then(({ isEmailEnabled, sendEmail, buildClickNotification }) => {
        if (isEmailEnabled()) {
          prisma.user.findUnique({ where: { id: profile.userId }, select: { email: true, username: true } }).then((owner) => {
            if (owner?.email) {
              sendEmail({
                to: owner.email,
                subject: `Someone clicked your ${platform} link`,
                html: buildClickNotification({
                  appName: process.env.SMTP_FROM_NAME || "BioPlatform",
                  platform,
                  profileUrl: `${process.env.APP_URL || "http://localhost:80"}/${owner.username}`,
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
