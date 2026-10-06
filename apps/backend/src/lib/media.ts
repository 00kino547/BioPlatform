import crypto from "crypto";
import fs from "fs";
import path from "path";
import { type NextFunction, type Request, type Response } from "express";
import sharp from "sharp";
import { CACHE_DIR_NAME, LONG_CACHE, materializeUpload, uploadRoot } from "./mediaStore.js";

const ALLOWED_WIDTHS = new Set([64, 96, 128, 160, 192, 256, 320, 384, 480, 640, 768, 896, 960, 1024, 1280, 1440, 1600, 1920]);
const DEFAULT_QUALITY = 80;
const MAX_WIDTH = 1920;
const IMAGE_EXTS = new Set([".jpeg", ".jpg", ".png", ".webp"]);

const MIME_TYPES: Record<string, string> = {
  webp: "image/webp",
  jpeg: "image/jpeg",
  png: "image/png",
};

const FILE_EXTS: Record<string, string> = {
  webp: ".webp",
  jpeg: ".jpg",
  png: ".png",
};

interface TransformParams {
  width: number;
  format: string;
  quality: number;
}

function parseTransform(raw: unknown): TransformParams | null {
  const width = Number(raw);
  if (!Number.isInteger(width) || width < 16 || width > MAX_WIDTH || !ALLOWED_WIDTHS.has(width)) return null;
  return { width, format: "webp", quality: DEFAULT_QUALITY };
}

function isSafeUploadRel(relative: string): boolean {
  const rel = relative.replace(/^\/+/, "");
  if (!rel || rel.includes("\0")) return false;
  if (rel === CACHE_DIR_NAME || rel.startsWith(`${CACHE_DIR_NAME}/`)) return false;
  if (rel === "products" || rel.startsWith("products/")) return false;
  return true;
}

function sendCached(res: Response, file: string, params: TransformParams) {
  res.setHeader("Content-Type", MIME_TYPES[params.format] ?? "application/octet-stream");
  res.setHeader("Cache-Control", LONG_CACHE);
  res.sendFile(file, { maxAge: "365d", immutable: true, dotfiles: "allow" });
}

export async function serveUpload(req: Request, res: Response, next: NextFunction): Promise<void> {
  const rel = (req.path ?? "").replace(/^\/+/, "");
  if (!isSafeUploadRel(rel)) {
    res.status(404).end();
    return;
  }

  const raw = req.query.w;
  if (raw !== undefined) {
    const params = parseTransform(raw);
    if (!params || !IMAGE_EXTS.has(path.extname(rel).toLowerCase())) {
      next();
      return;
    }
    void serveResized(res, next, rel, params);
    return;
  }

  const src = await materializeUpload(rel).catch(() => null);
  if (!src) {
    res.status(404).end();
    return;
  }

  res.setHeader("Cache-Control", LONG_CACHE);
  res.sendFile(src, { maxAge: "365d", immutable: true, dotfiles: "allow" });
}

async function serveResized(res: Response, next: NextFunction, rel: string, params: TransformParams): Promise<void> {
  const src = await materializeUpload(rel).catch(() => null);
  if (!src) {
    res.status(404).end();
    return;
  }

  try {
    const stat = await fs.promises.stat(src);
    if (!stat.isFile()) {
      res.status(404).end();
      return;
    }

    const root = uploadRoot();
    const cacheDir = path.join(root, CACHE_DIR_NAME);
    const cacheKey = crypto
      .createHash("sha256")
      .update(`${rel}|${params.width}|${params.format}|${params.quality}|${stat.mtimeMs}`)
      .digest("hex");
    const cacheFile = path.join(cacheDir, `${cacheKey}${FILE_EXTS[params.format]}`);

    const cached = await fs.promises.stat(cacheFile).catch(() => null);
    if (cached?.isFile()) {
      sendCached(res, cacheFile, params);
      return;
    }

    const buffer = await sharp(src, { failOn: "none" })
      .rotate()
      .resize({ width: params.width, withoutEnlargement: true })
      .toFormat(params.format as "webp", { quality: params.quality })
      .toBuffer();

    await fs.promises.mkdir(cacheDir, { recursive: true });
    await fs.promises.writeFile(cacheFile, buffer);
    sendCached(res, cacheFile, params);
  } catch {
    next();
  }
}