import fs from "fs";
import path from "path";
import { getEnv } from "../../config/env.js";
import type { MediaWriteOptions, StorageProvider, StorageProviderKind, StoredObject } from "./types.js";

export const MEDIA_CACHE_DIR = ".media-cache";

export class LocalStorageProvider implements StorageProvider {
  readonly kind: StorageProviderKind = "local";

  private readonly root: string;

  constructor(root?: string) {
    this.root = path.resolve(root ?? getEnv().LOCAL_STORAGE_PATH);
  }

  private container(abs: string): boolean {
    const rootPrefix = this.root.endsWith(path.sep) ? this.root : `${this.root}${path.sep}`;
    return abs === this.root || abs.startsWith(rootPrefix);
  }

  private safeName(name: string): boolean {
    return !!name && name !== "." && name !== ".." && !name.includes("\0");
  }

  resolveAbsolute(name: string): string | null {
    // Product files live one level below the root (e.g. "products/<uuid>.bin").
    // Allow subpaths, but reject traversal, absolute paths, empty segments and
    // NUL bytes so the resolved path can never escape the storage root.
    if (!this.safeName(name)) return null;
    const norm = name.replace(/\\/g, "/");
    if (path.isAbsolute(norm)) return null;
    const segments = norm.split("/");
    if (segments.some((seg) => seg === "" || seg === "." || seg === "..")) return null;
    const abs = path.resolve(this.root, norm);
    if (!this.container(abs)) return null;
    return abs;
  }

  resolveCachePath(relative: string): string | null {
    if (!this.safeName(relative)) return null;
    const abs = path.resolve(path.join(this.root, MEDIA_CACHE_DIR), relative);
    const cacheRoot = path.join(this.root, MEDIA_CACHE_DIR);
    const prefix = cacheRoot.endsWith(path.sep) ? cacheRoot : `${cacheRoot}${path.sep}`;
    if (abs !== cacheRoot && !abs.startsWith(prefix)) return null;
    return abs;
  }

  async writeObject(name: string, data: Buffer, _opts?: MediaWriteOptions): Promise<void> {
    const abs = this.resolveAbsolute(name);
    if (!abs) throw new Error(`Unsafe storage key "${name}"`);
    await fs.promises.mkdir(this.root, { recursive: true });
    await fs.promises.writeFile(abs, data);
  }

  async readObject(name: string): Promise<Buffer | null> {
    const abs = this.resolveAbsolute(name);
    if (!abs) return null;
    return fs.promises.readFile(abs).catch(() => null);
  }

  async statObject(name: string): Promise<StoredObject | null> {
    const abs = this.resolveAbsolute(name);
    if (!abs) return null;
    const stat = await fs.promises.stat(abs).catch(() => null);
    if (!stat || !stat.isFile()) return null;
    return { name, size: stat.size, mtimeMs: stat.mtimeMs };
  }

  async objectExists(name: string): Promise<boolean> {
    const abs = this.resolveAbsolute(name);
    if (!abs) return false;
    const stat = await fs.promises.stat(abs).catch(() => null);
    return !!stat && stat.isFile();
  }

  async listObjects(): Promise<StoredObject[]> {
    // Product files are written under a "products/" subdirectory, so walk the
    // whole storage tree (except the media cache) and report relative names
    // using forward slashes. This mirrors what cloud providers return and lets
    // orphan cleanup match refs like "products/<uuid>.bin" against the disk.
    const out: StoredObject[] = [];
    const walk = async (dir: string, relPrefix: string): Promise<void> => {
      let entries: fs.Dirent[];
      try {
        entries = await fs.promises.readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        if (entry.name === MEDIA_CACHE_DIR) continue;
        const abs = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(abs, relPrefix ? path.join(relPrefix, entry.name) : entry.name);
          continue;
        }
        if (!entry.isFile()) continue;
        const stat = await fs.promises.stat(abs).catch(() => null);
        if (!stat || !stat.isFile()) continue;
        const name = relPrefix ? path.join(relPrefix, entry.name) : entry.name;
        out.push({ name, size: stat.size, mtimeMs: stat.mtimeMs });
      }
    };
    await walk(this.root, "");
    return out;
  }

  async deleteObject(name: string): Promise<void> {
    const abs = this.resolveAbsolute(name);
    if (!abs) return;
    await fs.promises.unlink(abs);
  }

  async listMediaCache(): Promise<StoredObject[]> {
    const dir = path.join(this.root, MEDIA_CACHE_DIR);
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      return [];
    }
    const files: StoredObject[] = [];
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const abs = path.join(dir, entry.name);
      const stat = await fs.promises.stat(abs).catch(() => null);
      if (!stat || !stat.isFile()) continue;
      files.push({ name: entry.name, size: stat.size, mtimeMs: stat.mtimeMs });
    }
    return files;
  }

  async deleteMediaCacheFile(name: string): Promise<void> {
    const base = path.basename(name);
    if (!this.safeName(base) || base !== name) return;
    await fs.promises.unlink(path.join(this.root, MEDIA_CACHE_DIR, base));
  }

  async listCacheFiles(): Promise<StoredObject[]> {
    const cacheRoot = path.join(this.root, MEDIA_CACHE_DIR);
    const out: StoredObject[] = [];
    const walk = async (dir: string, relPrefix: string): Promise<void> => {
      let entries: fs.Dirent[];
      try {
        entries = await fs.promises.readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        const abs = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(abs, relPrefix ? path.join(relPrefix, entry.name) : entry.name);
          continue;
        }
        if (!entry.isFile()) continue;
        const stat = await fs.promises.stat(abs).catch(() => null);
        if (!stat) continue;
        const name = relPrefix ? path.join(relPrefix, entry.name) : entry.name;
        out.push({ name, size: stat.size, mtimeMs: stat.mtimeMs });
      }
    };
    await walk(cacheRoot, "");
    return out;
  }

  async deleteCacheFile(name: string): Promise<void> {
    const abs = this.resolveCachePath(name);
    if (!abs) return;
    const stat = await fs.promises.stat(abs).catch(() => null);
    if (!stat || !stat.isFile()) return;
    await fs.promises.unlink(abs);
  }
}

export function createLocalStorageProvider(root?: string): StorageProvider {
  return new LocalStorageProvider(root);
}