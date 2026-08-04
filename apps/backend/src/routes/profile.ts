import { Router, type Request, type Response, type NextFunction } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { getEnv } from "../config/env.js";
import { ALLOWED_PLATFORMS, updateProfileSchema, toPrismaJson } from "../lib/validation.js";

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

function getViewerId(req: Request): string | undefined {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return undefined;
  try {
    const payload = jwt.verify(header.slice(7), getEnv().JWT_SECRET) as { userId: string };
    return payload.userId;
  } catch {
    return undefined;
  }
}

function getVisitorId(req: Request): string {
  const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket.remoteAddress || "unknown";
  const ua = req.headers["user-agent"] || "unknown";
  const cookies = parseCookies(req.headers.cookie);
  const bpVid = cookies["bp_vid"] || "";
  return crypto.createHash("sha256").update(`${ip}|${ua}|${bpVid}`).digest("hex").slice(0, 32);
}

function getClientIp(req: Request): string {
  return (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket.remoteAddress || "unknown";
}

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
  const viewerId = getViewerId(req);

  const user = await prisma.user.findUnique({
    where: { username: req.params.username },
    select: {
      id: true,
      username: true,
      createdAt: true,
      profile: { include: { musicTracks: { orderBy: { position: "asc" } } } },
    },
  });

  if (!user) {
    return res.status(404).json({ success: false, error: "User not found" });
  }

  if (user.profile && !user.profile.isPublic && user.id !== viewerId) {
    return res.status(404).json({ success: false, error: "Profile not found" });
  }

  const profile = user.profile;

  if (profile && user.id !== viewerId) {
    const ip = getClientIp(req);
    const ua = req.headers["user-agent"] || null;
    const cookies = parseCookies(req.headers.cookie);
    const bpVid = cookies["bp_vid"] || crypto.randomBytes(16).toString("hex");

    const visitorId = crypto.createHash("sha256").update(`${ip}|${ua}|${bpVid}`).digest("hex").slice(0, 32);

    prisma.pageView.create({
      data: {
        profileId: profile.id,
        ip,
        userAgent: ua,
        visitorId,
        referer: (Array.isArray(req.headers["referer"]) ? req.headers["referer"][0] : req.headers["referer"]) ?? (Array.isArray(req.headers["referrer"]) ? req.headers["referrer"][0] : req.headers["referrer"]) ?? null,
      },
    }).catch(() => {});

    if (profile.notifyOnView) {
      import("../lib/email.js").then(({ isEmailEnabled, sendEmail, buildViewNotification }) => {
        if (isEmailEnabled()) {
          prisma.user.findUnique({ where: { id: user.id }, select: { email: true } }).then((owner) => {
            if (owner?.email) {
              sendEmail({
                to: owner.email,
                subject: `Someone viewed your profile`,
                html: buildViewNotification({
                  appName: process.env.SMTP_FROM_NAME || "BioPlatform",
                  profileUrl: `${process.env.APP_URL || "http://localhost:80"}/${user.username}`,
                  viewerIp: ip ?? undefined,
                }),
              }).catch(() => {});
            }
          }).catch(() => {});
        }
      }).catch(() => {});
    }

    const oneYear = 365 * 24 * 60 * 60 * 1000;
    res.cookie("bp_vid", bpVid, {
      maxAge: oneYear,
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    });
  }

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
      musicTracks: profile?.musicTracks ?? [],
      updatedAt: profile?.updatedAt ?? user.createdAt,
    },
  });
});

router.post("/click", async (req, res) => {
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
    select: { userId: true, notifyOnClick: true },
  });

  if (!profile) {
    return res.status(404).json({ success: false, error: "Profile not found" });
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
  }

  res.json({ success: true });
});

export default router;
