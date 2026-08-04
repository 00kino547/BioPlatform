import { Router, type Request, type Response, type NextFunction } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { getEnv } from "../config/env.js";
import { ALLOWED_PROVIDERS, getTrackLimit, parseMusicUrl, parseFullUrl } from "../lib/music.js";
import type { UserTier } from "@prisma/client";

const router = Router();

const uploadsDir = path.resolve(getEnv().LOCAL_STORAGE_PATH);
fs.mkdirSync(uploadsDir, { recursive: true });

const ALLOWED_AUDIO_EXTS = new Set([".mp3", ".opus", ".ogg", ".wav", ".m4a", ".flac", ".aac", ".webm", ".oga"]);

const audioUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      cb(null, uploadsDir);
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${crypto.randomUUID()}${ext}`);
    },
  }),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ALLOWED_AUDIO_EXTS.has(ext)) {
      cb(null, true);
    } else {
      cb(new multer.MulterError("LIMIT_UNEXPECTED_FILE", file.fieldname));
    }
  },
});

function handleAudioUpload(req: Request, res: Response, next: NextFunction) {
  audioUpload.single("file")(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({ success: false, error: "File too large (max 25MB)" });
      }
      if (err.code === "LIMIT_UNEXPECTED_FILE") {
        return res.status(400).json({ success: false, error: "Invalid file type. Use MP3, OGG, OPUS, WAV, M4A, FLAC, AAC, or WebM." });
      }
      return res.status(400).json({ success: false, error: `Upload error: ${err.message}` });
    }
    if (err) {
      return res.status(500).json({ success: false, error: "Upload failed" });
    }
    next();
  });
}

const addTrackSchema = z.object({
  provider: z.string().refine((p) => ALLOWED_PROVIDERS.has(p.toLowerCase()), {
    message: "Unsupported music provider",
  }),
  title: z.string().max(120).optional().transform((v) => (v ? v.replace(/[<>{}]/g, "").replace(/\s+/g, " ").trim() : v)),
  artist: z.string().max(120).optional().transform((v) => (v ? v.replace(/[<>{}]/g, "").replace(/\s+/g, " ").trim() : v)),
  url: z.string().max(512).optional(),
  fullUrl: z.string().max(512).optional().transform((v) => (v ? v.replace(/[<>{}]/g, "").trim() : v)),
});

const updateTrackSchema = z.object({
  title: z.string().max(120).optional().transform((v) => (v ? v.replace(/[<>{}]/g, "").replace(/\s+/g, " ").trim() : v)),
  artist: z.string().max(120).optional().transform((v) => (v ? v.replace(/[<>{}]/g, "").replace(/\s+/g, " ").trim() : v)),
  position: z.number().int().min(0).optional(),
  fullUrl: z.string().max(512).nullable().optional().transform((v) => (v ? v.replace(/[<>{}]/g, "").trim() : v)),
});

const reorderSchema = z.object({
  ids: z.array(z.string()).max(25),
});

async function getProfileWithUser(userId: string) {
  return prisma.profile.findUnique({
    where: { userId },
    include: { user: true },
  });
}

async function ensureTrackWithinLimit(userId: string, userTier: { tier: UserTier; trackLimit: number | null }): Promise<number | null> {
  const profile = await prisma.profile.findUnique({
    where: { userId },
    select: { id: true },
  });
  if (!profile) return null;

  const count = await prisma.musicTrack.count({ where: { profileId: profile.id } });
  const limit = getTrackLimit(userTier);
  if (count >= limit) return limit;
  return null;
}

router.get("/me", requireAuth, async (req, res) => {
  const profile = await prisma.profile.findUnique({
    where: { userId: req.userId! },
    include: { user: { select: { tier: true, trackLimit: true } }, musicTracks: { orderBy: { position: "asc" } } },
  });

  if (!profile) {
    return res.json({ success: true, data: { tracks: [], limit: 2, tier: "FREE" } });
  }

  res.json({
    success: true,
    data: {
      tracks: profile.musicTracks,
      limit: getTrackLimit(profile.user),
      tier: profile.user.tier,
    },
  });
});

router.post("/me", requireAuth, async (req, res) => {
  const parsed = addTrackSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: parsed.error.issues[0].message });
  }

  const { provider, title, artist, url, fullUrl } = parsed.data;
  const providerLower = provider.toLowerCase();

  const profile = await getProfileWithUser(req.userId!);
  if (!profile) {
    return res.status(404).json({ success: false, error: "Profile not found" });
  }

  const limit = await ensureTrackWithinLimit(req.userId!, profile.user);
  if (limit !== null) {
    return res.status(400).json({
      success: false,
      error: `Track limit reached (${limit}). Upgrade your tier to add more tracks.`,
    });
  }

  let urlValue: string | null = null;
  if (providerLower === "local") {
    urlValue = url ?? null;
  } else {
    if (!url) {
      return res.status(400).json({ success: false, error: `A valid ${provider} URL is required` });
    }
    const parsedUrl = parseMusicUrl(providerLower, url);
    if (!parsedUrl) {
      return res.status(400).json({ success: false, error: `Invalid ${provider} URL` });
    }
    urlValue = parsedUrl.embedUrl;
  }

  let fullUrlValue: string | null = null;
  if (fullUrl) {
    const parsedFull = parseFullUrl(fullUrl);
    if (!parsedFull) {
      return res.status(400).json({ success: false, error: "Invalid full version URL" });
    }
    fullUrlValue = parsedFull.embedUrl;
  }

  const position = await prisma.musicTrack.count({ where: { profileId: profile.id } });

  const track = await prisma.musicTrack.create({
    data: {
      profileId: profile.id,
      provider: providerLower,
      title: title ?? null,
      artist: artist ?? null,
      url: urlValue,
      fullUrl: fullUrlValue,
      position,
    },
  });

  res.status(201).json({ success: true, data: track });
});

router.post("/me/upload", requireAuth, handleAudioUpload, async (req, res) => {
  const profile = await getProfileWithUser(req.userId!);
  if (!profile) {
    if (req.file) fs.unlinkSync(req.file.path);
    return res.status(404).json({ success: false, error: "Profile not found" });
  }

  const limit = await ensureTrackWithinLimit(req.userId!, profile.user);
  if (limit !== null) {
    if (req.file) fs.unlinkSync(req.file.path);
    return res.status(400).json({
      success: false,
      error: `Track limit reached (${limit}). Upgrade your tier to add more tracks.`,
    });
  }

  if (!req.file) {
    return res.status(400).json({ success: false, error: "No file uploaded" });
  }

  const filePath = `/uploads/${req.file.filename}`;
  const rawTitle = typeof req.body.title === "string" ? req.body.title : undefined;
  const rawArtist = typeof req.body.artist === "string" ? req.body.artist : undefined;
  const rawFullUrl = typeof req.body.fullUrl === "string" ? req.body.fullUrl : undefined;
  const title = rawTitle?.replace(/[<>{}]/g, "").replace(/\s+/g, " ").trim() || null;
  const artist = rawArtist?.replace(/[<>{}]/g, "").replace(/\s+/g, " ").trim() || null;
  let fullUrlValue: string | null = null;
  if (rawFullUrl) {
    const parsedFull = parseFullUrl(rawFullUrl.replace(/[<>{}]/g, "").trim());
    if (!parsedFull) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ success: false, error: "Invalid full version URL" });
    }
    fullUrlValue = parsedFull.embedUrl;
  }

  const position = await prisma.musicTrack.count({ where: { profileId: profile.id } });

  const track = await prisma.musicTrack.create({
    data: {
      profileId: profile.id,
      provider: "local",
      title,
      artist,
      filePath,
      fullUrl: fullUrlValue,
      position,
    },
  });

  res.status(201).json({ success: true, data: track });
});

router.patch("/:id", requireAuth, async (req: Request<{ id: string }>, res) => {
  const parsed = updateTrackSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: parsed.error.issues[0].message });
  }

  const track = await prisma.musicTrack.findUnique({
    where: { id: req.params.id },
    include: { profile: true },
  });

  if (!track || track.profile.userId !== req.userId) {
    return res.status(404).json({ success: false, error: "Track not found" });
  }

  const updateData: Record<string, unknown> = { ...parsed.data };
  if (updateData.fullUrl) {
    const parsedFull = parseFullUrl(updateData.fullUrl as string);
    if (!parsedFull) {
      return res.status(400).json({ success: false, error: "Invalid full version URL" });
    }
    updateData.fullUrl = parsedFull.embedUrl;
  }

  const updated = await prisma.musicTrack.update({
    where: { id: track.id },
    data: updateData,
  });

  res.json({ success: true, data: updated });
});

router.post("/reorder", requireAuth, async (req, res) => {
  const parsed = reorderSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: parsed.error.issues[0].message });
  }

  const profile = await prisma.profile.findUnique({
    where: { userId: req.userId! },
    select: { id: true },
  });
  if (!profile) {
    return res.status(404).json({ success: false, error: "Profile not found" });
  }

  const tracks = await prisma.musicTrack.findMany({
    where: { profileId: profile.id },
    select: { id: true },
  });
  const ownedIds = new Set(tracks.map((t) => t.id));

  const updates: { id: string; position: number }[] = [];
  parsed.data.ids.forEach((id, index) => {
    if (ownedIds.has(id)) updates.push({ id, position: index });
  });

  await prisma.$transaction(
    updates.map((u) => prisma.musicTrack.update({ where: { id: u.id }, data: { position: u.position } }))
  );

  res.json({ success: true });
});

router.delete("/:id", requireAuth, async (req: Request<{ id: string }>, res) => {
  const track = await prisma.musicTrack.findUnique({
    where: { id: req.params.id },
    include: { profile: true },
  });

  if (!track || track.profile.userId !== req.userId) {
    return res.status(404).json({ success: false, error: "Track not found" });
  }

  if (track.filePath) {
    const filePath = path.resolve(getEnv().LOCAL_STORAGE_PATH, path.basename(track.filePath));
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }

  await prisma.musicTrack.delete({ where: { id: track.id } });

  const remaining = await prisma.musicTrack.findMany({
    where: { profileId: track.profileId },
    orderBy: { position: "asc" },
    select: { id: true },
  });
  await prisma.$transaction(
    remaining.map((t, i) => prisma.musicTrack.update({ where: { id: t.id }, data: { position: i } }))
  );

  res.json({ success: true });
});

export default router;
