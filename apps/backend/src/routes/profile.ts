import { Router, type Request, type Response, type NextFunction } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { getEnv } from "../config/env.js";

const router = Router();

const uploadsDir = path.resolve(getEnv().LOCAL_STORAGE_PATH);
fs.mkdirSync(uploadsDir, { recursive: true });

const ALLOWED_EXTS = new Set([".jpeg", ".jpg", ".png", ".gif", ".webp"]);

const ALLOWED_PLATFORMS = new Set([
  "twitter", "x", "github", "youtube", "twitch", "discord",
  "tiktok", "instagram", "facebook", "linkedin", "spotify", "email",
]);

function stripHtml(input: string): string {
  return input.replace(/[<>{}]/g, "").replace(/\s+/g, " ").trim();
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

function isValidDiscordUsername(value: string): boolean {
  if (/^https?:\/\//i.test(value)) {
    try {
      const url = new URL(value);
      const h = url.hostname.toLowerCase();
      return (
        (h === "discord.gg" || h.endsWith(".discord.gg") || h === "discord.com" || h === "discordapp.com") &&
        /^\/invite\/.+/.test(url.pathname) ||
        (h === "discord.gg" && /^\/.+/.test(url.pathname) && !url.pathname.startsWith("/invite"))
      );
    } catch {
      return false;
    }
  }
  return /^[a-z0-9_.]{2,32}$/.test(value) && !/\.\./.test(value) && !/^\./.test(value) && !/\.$/.test(value);
}

function isValidSocialUrl(platform: string, value: string): boolean {
  if (platform.toLowerCase() === "email") {
    const v = value.startsWith("mailto:") ? value.slice(7) : value;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) && v.length <= 256;
  }
  if (platform.toLowerCase() === "discord") {
    return isValidDiscordUsername(value);
  }
  try {
    const url = new URL(value);
    return ["http:", "https:", "mailto:"].includes(url.protocol) && value.length <= 256;
  } catch {
    return false;
  }
}

const updateProfileSchema = z.object({
  displayName: z.string().max(64).nullable().optional().transform((v) => (v ? stripHtml(v) : v)),
  bio: z.string().max(500).nullable().optional().transform((v) => (v ? stripHtml(v) : v)),
  location: z.string().max(100).nullable().optional().transform((v) => (v ? stripHtml(v) : v)),
  website: z.string().url().max(256).nullable().optional(),
  socialLinks: z
    .array(
      z.object({
        platform: z.string().max(32).refine((p) => ALLOWED_PLATFORMS.has(p.toLowerCase()), {
          message: "Unsupported platform",
        }),
        url: z.string().max(256).transform((v) => stripHtml(v)),
      })
    )
    .max(10)
    .nullable()
    .optional()
    .refine(
      (links) => !links || links.every((l) => isValidSocialUrl(l.platform, l.url)),
      { message: "One or more links have an invalid URL or username" }
    ),
  theme: z
    .object({
      bg: z.string().optional(),
      cardBg: z.string().optional(),
      text: z.string().optional(),
      accent: z.string().optional(),
      fontFamily: z.string().optional(),
    })
    .nullable()
    .optional(),
  isPublic: z.boolean().optional(),
});

function toPrismaJson(val: unknown) {
  if (val === null) return Prisma.JsonNull;
  if (val === undefined) return undefined;
  return val as Prisma.InputJsonValue;
}

router.get("/me", requireAuth, async (req, res) => {
  const profile = await prisma.profile.findUnique({
    where: { userId: req.userId! },
  });

  res.json({ success: true, data: profile });
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

  const profile = await prisma.profile.upsert({
    where: { userId: req.userId! },
    update: {
      ...rest,
      socialLinks: toPrismaJson(normalizedLinks),
      theme: toPrismaJson(theme),
    },
    create: {
      userId: req.userId!,
      ...rest,
      socialLinks: toPrismaJson(normalizedLinks),
      theme: toPrismaJson(theme),
    },
  });

  res.json({ success: true, data: profile });
});

router.post("/me/avatar", requireAuth, handleUpload("avatar"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, error: "No file uploaded" });
  }

  const filePath = `/uploads/${req.file.filename}`;

  await prisma.profile.upsert({
    where: { userId: req.userId! },
    update: { avatar: filePath },
    create: { userId: req.userId!, avatar: filePath },
  });

  res.json({ success: true, data: { avatar: filePath } });
});

router.post("/me/banner", requireAuth, handleUpload("banner"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, error: "No file uploaded" });
  }

  const filePath = `/uploads/${req.file.filename}`;

  await prisma.profile.upsert({
    where: { userId: req.userId! },
    update: { banner: filePath },
    create: { userId: req.userId!, banner: filePath },
  });

  res.json({ success: true, data: { banner: filePath } });
});

router.delete("/me/avatar", requireAuth, async (req, res) => {
  const profile = await prisma.profile.findUnique({
    where: { userId: req.userId! },
    select: { avatar: true },
  });

  if (profile?.avatar) {
    const filePath = path.resolve(getEnv().LOCAL_STORAGE_PATH, path.basename(profile.avatar));
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }

  await prisma.profile.update({
    where: { userId: req.userId! },
    data: { avatar: null },
  });

  res.json({ success: true });
});

router.delete("/me/banner", requireAuth, async (req, res) => {
  const profile = await prisma.profile.findUnique({
    where: { userId: req.userId! },
    select: { banner: true },
  });

  if (profile?.banner) {
    const filePath = path.resolve(getEnv().LOCAL_STORAGE_PATH, path.basename(profile.banner));
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }

  await prisma.profile.update({
    where: { userId: req.userId! },
    data: { banner: null },
  });

  res.json({ success: true });
});

router.get("/:username", async (req, res) => {
  let viewerId: string | undefined;
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    try {
      const jwt = await import("jsonwebtoken");
      const payload = jwt.default.verify(header.slice(7), getEnv().JWT_SECRET) as { userId: string };
      viewerId = payload.userId;
    } catch {}
  }

  const user = await prisma.user.findUnique({
    where: { username: req.params.username },
    select: {
      id: true,
      username: true,
      createdAt: true,
      profile: true,
    },
  });

  if (!user) {
    return res.status(404).json({ success: false, error: "User not found" });
  }

  if (user.profile && !user.profile.isPublic && user.id !== viewerId) {
    return res.status(404).json({ success: false, error: "Profile not found" });
  }

  const profile = user.profile;

  res.json({
    success: true,
    data: {
      username: user.username,
      createdAt: user.createdAt,
      id: profile?.id ?? null,
      userId: profile?.userId ?? user.id,
      displayName: profile?.displayName ?? null,
      bio: profile?.bio ?? null,
      avatar: profile?.avatar ?? null,
      banner: profile?.banner ?? null,
      location: profile?.location ?? null,
      website: profile?.website ?? null,
      socialLinks: profile?.socialLinks ?? null,
      theme: profile?.theme ?? null,
      isPublic: profile?.isPublic ?? true,
      updatedAt: profile?.updatedAt ?? user.createdAt,
    },
  });
});

export default router;
