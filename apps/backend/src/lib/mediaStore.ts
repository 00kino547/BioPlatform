import crypto from "crypto";
import fs from "fs";
import path from "path";
import { getEnv } from "../config/env.js";
import { getPrimaryStorageProvider } from "./storage/index.js";
import { MEDIA_CACHE_DIR, LocalStorageProvider } from "./storage/local.js";
import type { MediaWriteOptions, StoredObject } from "./storage/types.js";

export const CACHE_DIR_NAME = MEDIA_CACHE_DIR;
export const ORIGINALS_CACHE_SUBDIR = "originals";
export const LONG_CACHE = "public, max-age=31536000, immutable";

export function uploadRoot(): string {
  return path.resolve(getEnv().LOCAL_STORAGE_PATH);
}

export function resolveUploadAbs(relative: string): string | null {
  const rel = relative.replace(/^\/+/, "");
  if (!rel || rel.includes("\0")) return null;
  const root = uploadRoot();
  const abs = path.resolve(root, rel);
  const rootPrefix = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  if (abs !== root && !abs.startsWith(rootPrefix)) return null;
  return abs;
}

function cacheAbs(relativeUnderCache: string): string | null {
  const cacheRel = relativeUnderCache.replace(/^\/+/, "");
  if (!cacheRel || cacheRel.includes("\0") || cacheRel === "." || cacheRel === "..") return null;
  const cacheRoot = path.join(uploadRoot(), CACHE_DIR_NAME);
  const abs = path.resolve(cacheRoot, cacheRel);
  const prefix = cacheRoot.endsWith(path.sep) ? cacheRoot : `${cacheRoot}${path.sep}`;
  return abs !== cacheRoot && abs.startsWith(prefix) ? abs : null;
}

function originalsKey(providerKind: string, rel: string): string {
  return crypto.createHash("sha256").update(`${providerKind}:${rel}`).digest("hex");
}

export function originalsCachePath(providerKind: string, rel: string): string | null {
  const name = `${originalsKey(providerKind, rel)}${path.extname(rel)}`;
  return cacheAbs(path.join(ORIGINALS_CACHE_SUBDIR, name));
}

export async function writeUpload(filename: string, opts?: MediaWriteOptions): Promise<void> {
  const provider = getPrimaryStorageProvider();
  if (provider.kind === "local") return;
  const base = path.basename(filename);
  const tempAbs = resolveUploadAbs(base);
  if (!tempAbs) return;
  const data = await fs.promises.readFile(tempAbs).catch(() => null);
  if (!data) return;
  await provider.writeObject(base, data, opts);
  await fs.promises.unlink(tempAbs).catch(() => undefined);
}

export async function deleteUpload(name: string): Promise<void> {
  const provider = getPrimaryStorageProvider();
  const base = path.basename(name);
  if (provider.kind !== "local") {
    const tempAbs = resolveUploadAbs(base);
    if (tempAbs) await fs.promises.unlink(tempAbs).catch(() => undefined);
    const cacheFile = originalsCachePath(provider.kind, base);
    if (cacheFile) await fs.promises.unlink(cacheFile).catch(() => undefined);
  }
  await provider.deleteObject(base).catch(() => undefined);
}

export async function materializeUpload(relative: string): Promise<string | null> {
  const rel = relative.replace(/^\/+/, "");
  if (!rel || rel.includes("\0")) return null;
  const provider = getPrimaryStorageProvider();

  if (provider.kind === "local") {
    const abs = resolveUploadAbs(rel);
    if (!abs) return null;
    const stat = await fs.promises.stat(abs).catch(() => null);
    return stat?.isFile() ? abs : null;
  }

  const cacheFile = originalsCachePath(provider.kind, rel);
  if (!cacheFile) return null;
  const maxAgeMs = getEnv().MEDIA_CACHE_MAX_AGE_HOURS * 60 * 60 * 1000;
  const cached = await fs.promises.stat(cacheFile).catch(() => null);
  if (cached?.isFile() && cached.mtimeMs > Date.now() - maxAgeMs) return cacheFile;

  const data = await provider.readObject(rel);
  if (!data) return null;
  await fs.promises.mkdir(path.dirname(cacheFile), { recursive: true });
  await fs.promises.writeFile(cacheFile, data);
  return cacheFile;
}

export async function pruneMediaCacheCaps(local: LocalStorageProvider, maxEntries: number, maxSizeBytes: number, files: StoredObject[]): Promise<number> {
  if (files.length <= maxEntries) return 0;
  const pending = [...files].sort((a, b) => a.mtimeMs - b.mtimeMs);
  let totalBytes = pending.reduce((sum, file) => sum + file.size, 0);
  let pruned = 0;
  while (pending.length > 0 && (pending.length > maxEntries || totalBytes > maxSizeBytes)) {
    const oldest = pending.shift()!;
    try {
      await local.deleteCacheFile(oldest.name);
      totalBytes -= oldest.size;
      pruned += 1;
    } catch {
      break;
    }
  }
  return pruned;
}