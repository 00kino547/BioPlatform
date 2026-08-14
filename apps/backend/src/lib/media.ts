import crypto from "crypto";
import fs from "fs";
import path from "path";
import { type NextFunction, type Request, type Response } from "express";
import sharp from "sharp";
import { getEnv } from "../config/env.js";

const ALLOWED_WIDTHS = new Set([64, 96, 128, 160, 192, 256, 320, 384, 480, 640, 768, 896, 960, 1024, 1280, 1440, 1600, 1920]);
const DEFAULT_QUALITY = 80;
const MAX_WIDTH = 1920;
const CACHE_DIR_NAME = ".media-cache";
const LONG_CACHE = "public, max-age=31536000, immutable";
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

function resolveUpload(root: string, relative: string): string | null {
  const rel = relative.replace(/^\/+/, "");
  if (!rel || rel.includes("\0")) return null;
  const abs = path.resolve(root, rel);
  const rootPrefix = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  if (abs !== root && !abs.startsWith(rootPrefix)) return null;
  return abs;
}

function sendCached(res: Response, file: string, params: TransformParams) {
  res.setHeader("Content-Type", MIME_TYPES[params.format] ?? "application/octet-stream");
  res.setHeader("Cache-Control", LONG_CACHE);
  res.sendFile(file, { maxAge: "365d", immutable: true, dotfiles: "allow" });
}

export function optimizeUploadImage(req: Request, res: Response, next: NextFunction) {
  const raw = req.query.w;
  if (raw === undefined) return next();
  const params = parseTransform(raw);
  if (!params) return next();

  const rel = (req.path ?? "").replace(/^\/+/, "");
  if (!rel || rel.startsWith(CACHE_DIR_NAME)) return res.status(404).end();
  const root = path.resolve(getEnv().LOCAL_STORAGE_PATH);
  const src = resolveUpload(root, rel);
  if (!src) return res.status(404).end();
  if (!IMAGE_EXTS.has(path.extname(src).toLowerCase())) return next();

  void (async () => {
    try {
      const stat = await fs.promises.stat(src);
      if (!stat.isFile()) return res.status(404).end();

      const cacheDir = path.join(root, CACHE_DIR_NAME);
      const cacheKey = crypto
        .createHash("sha256")
        .update(`${rel}|${params.width}|${params.format}|${params.quality}|${stat.mtimeMs}`)
        .digest("hex");
      const cacheFile = path.join(cacheDir, `${cacheKey}${FILE_EXTS[params.format]}`);

      const cached = await fs.promises.stat(cacheFile).catch(() => null);
      if (cached?.isFile()) return sendCached(res, cacheFile, params);

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
  })();
}
