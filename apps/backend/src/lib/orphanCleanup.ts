import { getEnv } from "../config/env.js";
import { prisma } from "./prisma.js";
import { getStorageProviders } from "./storage/index.js";
import { LocalStorageProvider } from "./storage/local.js";
import type { StoredObject } from "./storage/types.js";
import { pruneMediaCacheCaps } from "./mediaStore.js";

export const ADVISORY_LOCK_KEY = 7918373_901;

export interface OrphanCleanupStats {
  scanned: number;
  deleted: number;
  freedBytes: number;
  mediaCachePruned: number;
}

export function normalizeRef(ref: string | null | undefined): string | null {
  if (!ref || typeof ref !== "string") return null;
  const t = ref.trim().replace(/\\/g, "/");
  if (/^[a-z][a-z\d+.-]*:\/\//i.test(t)) return null;
  if (t.startsWith("data:") || t.startsWith("//")) return null;
  const parts = t.split("/").filter((seg) => seg.length > 0);
  if (parts.length < 2 || parts[0] !== "uploads") return null;
  if (parts.some((seg) => seg === "." || seg === "..")) return null;
  // Return the storage-relative key, preserving subdirectories so that product
  // refs like "/uploads/products/<uuid>.bin" map to the object key
  // "products/<uuid>.bin" returned by cloud and (now) local providers.
  const inner = parts.slice(1);
  if (inner.length === 0 || inner.some((seg) => seg === "." || seg === ".." || seg.includes("\0"))) return null;
  return inner.join("/");
}

export function collectReferenceNames(refs: Array<string | null | undefined>): Set<string> {
  const names = new Set<string>();
  for (const ref of refs) {
    const name = normalizeRef(ref);
    if (name) names.add(name);
  }
  return names;
}

export function computeOrphans(
  objects: StoredObject[],
  referenced: ReadonlySet<string>,
  graceMs: number,
  now = Date.now()
): StoredObject[] {
  const cutoff = now - graceMs;
  return objects.filter((o) => !referenced.has(o.name) && o.mtimeMs <= cutoff);
}

export function computeMediaCacheExpired(
  files: StoredObject[],
  maxAgeMs: number,
  now = Date.now()
): StoredObject[] {
  const cutoff = now - maxAgeMs;
  return files.filter((f) => f.mtimeMs <= cutoff);
}

function isUploadReferenceRef(ref: unknown): ref is string {
  return typeof ref === "string";
}

export async function collectReferencedNames(): Promise<Set<string>> {
  const refs: Array<string | null | undefined> = [];

  const profiles = await prisma.profile.findMany({ select: { avatar: true, banner: true, theme: true, socialLinks: true } });
  for (const profile of profiles) {
    refs.push(profile.avatar, profile.banner);
    const theme = profile.theme as { backgroundImage?: unknown } | null;
    if (theme && isUploadReferenceRef(theme.backgroundImage)) refs.push(theme.backgroundImage);
    const socialLinks = profile.socialLinks as Array<{ image?: unknown }> | null;
    if (Array.isArray(socialLinks)) {
      for (const link of socialLinks) {
        if (link && isUploadReferenceRef(link.image)) refs.push(link.image);
      }
    }
  }

  const seasonalThemes = await prisma.seasonalTheme.findMany({ select: { config: true } });
  for (const seasonalTheme of seasonalThemes) {
    const config = seasonalTheme.config as { backgroundImage?: unknown };
    if (config && isUploadReferenceRef(config.backgroundImage)) refs.push(config.backgroundImage);
  }

  const tracks = await prisma.musicTrack.findMany({ select: { filePath: true } });
  for (const track of tracks) refs.push(track.filePath);

  const products = await prisma.product.findMany({ select: { filePath: true, previewImage: true } });
  for (const product of products) refs.push(product.filePath, product.previewImage);

  return collectReferenceNames(refs);
}

async function pruneMediaCache(local: LocalStorageProvider, maxAgeMs: number, now: number): Promise<number> {
  const files = await local.listMediaCache();
  const expired = computeMediaCacheExpired(files, maxAgeMs, now);
  let pruned = 0;
  for (const file of expired) {
    try {
      await local.deleteMediaCacheFile(file.name);
      pruned += 1;
    } catch (error) {
      console.error(`Orphan cleanup: failed to prune media-cache file ${file.name}:`, error);
    }
  }
  return pruned;
}

async function doCleanup(): Promise<OrphanCleanupStats> {
  const env = getEnv();
  const now = Date.now();
  const graceMs = env.ORPHAN_CLEANUP_GRACE_HOURS * 60 * 60 * 1000;
  const stats: OrphanCleanupStats = { scanned: 0, deleted: 0, freedBytes: 0, mediaCachePruned: 0 };

  const referenced = await collectReferencedNames();

  const providers = getStorageProviders();
  for (const provider of providers) {
    const objects = await provider.listObjects();
    stats.scanned += objects.length;
    const orphans = computeOrphans(objects, referenced, graceMs, now);
    for (const orphan of orphans) {
      try {
        await provider.deleteObject(orphan.name);
        stats.deleted += 1;
        stats.freedBytes += orphan.size;
      } catch (error) {
        console.error(`Orphan cleanup: failed to delete ${orphan.name} (${provider.kind}):`, error);
      }
    }
  }

  stats.mediaCachePruned = await pruneMediaCache(new LocalStorageProvider(), env.MEDIA_CACHE_MAX_AGE_HOURS * 60 * 60 * 1000, now);
  const local = new LocalStorageProvider();
  const cacheFiles = await local.listCacheFiles();
  stats.mediaCachePruned += await pruneMediaCacheCaps(local, env.MEDIA_CACHE_MAX_ENTRIES, env.MEDIA_CACHE_MAX_SIZE_MB * 1024 * 1024, cacheFiles);

  if (stats.deleted > 0 || stats.mediaCachePruned > 0) {
    const freedMb = (stats.freedBytes / (1024 * 1024)).toFixed(1);
    console.log(
      `Orphan cleanup: deleted ${stats.deleted} orphan uploads (${freedMb} MB), pruned ${stats.mediaCachePruned} media-cache files (scanned ${stats.scanned} uploads)`
    );
  }
  return stats;
}

async function acquireCleanupLock(): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ lock: boolean }[]>`SELECT pg_try_advisory_lock(${ADVISORY_LOCK_KEY}) AS "lock"`;
  return rows[0]?.lock === true;
}

async function releaseCleanupLock(): Promise<void> {
  await prisma.$queryRaw`SELECT pg_advisory_unlock(${ADVISORY_LOCK_KEY})`;
}

let cleanupRunning = false;

export async function runOrphanCleanup(): Promise<OrphanCleanupStats | null> {
  if (cleanupRunning) return null;
  cleanupRunning = true;
  try {
    const locked = await acquireCleanupLock();
    if (!locked) return null;
    try {
      return await doCleanup();
    } finally {
      await releaseCleanupLock().catch(() => {});
    }
  } catch (error) {
    console.error("Orphan cleanup failed:", error);
    return null;
  } finally {
    cleanupRunning = false;
  }
}

let cleanupStarted = false;

export function startOrphanCleanup(): void {
  if (cleanupStarted) return;
  cleanupStarted = true;
  const env = getEnv();
  setInterval(() => {
    void runOrphanCleanup();
  }, env.ORPHAN_CLEANUP_INTERVAL_MINUTES * 60 * 1000);
  void runOrphanCleanup();
  console.log(`Orphan cleanup started (every ${env.ORPHAN_CLEANUP_INTERVAL_MINUTES} minutes)`);
}