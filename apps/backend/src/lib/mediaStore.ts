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

  let data: Buffer | null = null;
  try {
    data = await provider.readObject(rel);
  } catch (error) {
    // A provider outage (invalid/expired cloud credentials, network failure)
    // used to bubble up and turn into a silent 404 — the root cause never
    // appeared in the logs. Log the storage failure, then fall through to the
    // stale-cache fallback below so profiles keep serving their media until
    // storage recovers.
    console.error(
      `Media storage read failed for "${rel}" via provider "${provider.kind}"; falling back to stale cache if present:`,
      error
    );
    data = null;
  }
  if (!data) {
    // Stale fallback: an expired cache entry is better than a hard 404 when
    // the origin is unreachable. Only returned when the origin is broken;
    // fresh reads always win (see the maxAge check above).
    const stale = await fs.promises.stat(cacheFile).catch(() => null);
    if (stale?.isFile()) return cacheFile;
    return null;
  }
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