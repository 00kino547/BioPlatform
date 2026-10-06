import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { getEnv } from "../config/env.js";
import { prisma } from "./prisma.js";

export interface CacheDriver {
  readonly kind: "memory" | "redis" | "file" | "db";
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlMs: number): Promise<void>;
  del(key: string): Promise<void>;
}

const MEMORY_CAP = 5000;

class MemoryDriver implements CacheDriver {
  readonly kind = "memory" as const;
  private store = new Map<string, { value: string; expiresAt: number }>();
  private timer: NodeJS.Timeout | null = null;

  constructor() {
    this.timer = setInterval(() => this.sweep(), 60_000);
    this.timer.unref?.();
  }

  async get(key: string): Promise<string | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(key: string, value: string, ttlMs: number): Promise<void> {
    if (this.store.size >= MEMORY_CAP) {
      this.sweep();
    }
    this.store.set(key, { value, expiresAt: Date.now() + Math.max(1, ttlMs) });
  }

  async del(key: string): Promise<void> {
    this.store.delete(key);
  }

  private sweep(): void {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (now > entry.expiresAt) this.store.delete(key);
    }
    if (this.store.size > MEMORY_CAP) {
      const oldest = [...this.store.entries()].sort((a, b) => a[1].expiresAt - b[1].expiresAt);
      const overflow = this.store.size - MEMORY_CAP;
      for (let i = 0; i < overflow && i < oldest.length; i++) {
        this.store.delete(oldest[i][0]);
      }
    }
  }
}

class RedisDriver implements CacheDriver {
  readonly kind = "redis" as const;
  private client: import("ioredis").Redis | null = null;
  private warned = false;
  private connected = false;

  private warnOnce(message: string): void {
    if (this.warned) return;
    this.warned = true;
    console.warn(message);
  }

  private async clientOrNull(): Promise<import("ioredis").Redis | null> {
    if (this.client && this.connected) return this.client;
    const url = getEnv().CACHE_REDIS_URL;
    if (!url) {
      this.warnOnce("[cache] CACHE_REDIS_URL is unset; cache reads will miss.");
      return null;
    }
    try {
      const { Redis } = await import("ioredis");
      this.client = new Redis(url, {
        maxRetriesPerRequest: 1,
        connectTimeout: 3000,
        lazyConnect: true,
        enableOfflineQueue: false,
        retryStrategy: () => null,
      });
      this.connected = false;
      let pending = 1;
      this.client.on("error", () => {});
      this.client.on("connect", () => {
        this.connected = true;
      });
      this.client.on("close", () => {
        this.connected = false;
        if (pending-- <= 0) this.warnOnce("[cache] Redis connection closed; cache reads will miss until reconnect.");
      });
      const ok = await this.client.connect().catch(() => false);
      this.connected = ok !== false;
      if (!this.connected) {
        this.warnOnce("[cache] Could not connect to Redis; cache reads will miss (falling back to upstream source).");
      }
      return this.connected ? this.client : null;
    } catch {
      this.warnOnce("[cache] Could not initialize ioredis; cache reads will miss.");
      return null;
    }
  }

  async get(key: string): Promise<string | null> {
    const client = await this.clientOrNull();
    if (!client) return null;
    try {
      const value = await client.get(key);
      return typeof value === "string" ? value : null;
    } catch {
      return null;
    }
  }

  async set(key: string, value: string, ttlMs: number): Promise<void> {
    const client = await this.clientOrNull();
    if (!client) return;
    try {
      await client.set(key, value, "PX", Math.max(1, ttlMs));
    } catch {
      // best-effort; upstream source will be consulted instead
    }
  }

  async del(key: string): Promise<void> {
    const client = await this.clientOrNull();
    if (!client) return;
    try {
      await client.del(key);
    } catch {
      // best-effort
    }
  }
}

class FileDriver implements CacheDriver {
  readonly kind = "file" as const;
  private dir: string | null = null;

  private async dirPath(): Promise<string | null> {
    if (this.dir) return this.dir;
    const configured = getEnv().CACHE_FILE_DIR;
    const base = configured || path.resolve(process.cwd(), "data", "cache");
    try {
      mkdirSync(base, { recursive: true });
      this.dir = base;
      return base;
    } catch {
      return null;
    }
  }

  private fileFor(key: string): string {
    const hash = createHash("sha256").update(key).digest("hex");
    return path.join(this.dir!, `${hash}.json`);
  }

  async get(key: string): Promise<string | null> {
    const dir = await this.dirPath();
    if (!dir) return null;
    const file = this.fileFor(key);
    try {
      const parsed = JSON.parse(readFileSync(file, "utf8")) as {
        value?: unknown;
        expiresAt?: number;
      };
      if (typeof parsed.value !== "string" || typeof parsed.expiresAt !== "number") {
        unlinkSync(file);
        return null;
      }
      if (Date.now() > parsed.expiresAt) {
        unlinkSync(file);
        return null;
      }
      return parsed.value;
    } catch {
      return null;
    }
  }

  async set(key: string, value: string, ttlMs: number): Promise<void> {
    const dir = await this.dirPath();
    if (!dir) return;
    const file = this.fileFor(key);
    const tmp = `${file}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
    try {
      writeFileSync(tmp, JSON.stringify({ value, expiresAt: Date.now() + Math.max(1, ttlMs) }));
      renameSync(tmp, file);
    } catch {
      try {
        rmSync(tmp, { force: true });
      } catch {
        // ignore cleanup failure
      }
    }
  }

  async del(key: string): Promise<void> {
    const dir = await this.dirPath();
    if (!dir) return;
    try {
      unlinkSync(this.fileFor(key));
    } catch {
      // already gone
    }
  }
}

class DbDriver implements CacheDriver {
  readonly kind = "db" as const;

  async get(key: string): Promise<string | null> {
    try {
      const row = await prisma.cacheEntry.findUnique({ where: { key } });
      if (!row) return null;
      if (Date.now() > row.expiresAt.getTime()) {
        await prisma.cacheEntry.deleteMany({ where: { key, expiresAt: { lt: new Date() } } });
        return null;
      }
      return row.value;
    } catch {
      return null;
    }
  }

  async set(key: string, value: string, ttlMs: number): Promise<void> {
    try {
      await prisma.cacheEntry.upsert({
        where: { key },
        update: { value, expiresAt: new Date(Date.now() + Math.max(1, ttlMs)) },
        create: { key, value, expiresAt: new Date(Date.now() + Math.max(1, ttlMs)) },
      });
    } catch {
      // best-effort
    }
  }

  async del(key: string): Promise<void> {
    try {
      await prisma.cacheEntry.deleteMany({ where: { key } });
    } catch {
      // best-effort
    }
  }
}

let instance: CacheDriver | null = null;

export function getCacheDriver(): CacheDriver {
  if (instance) return instance;
  const driver = getEnv().CACHE_DRIVER;
  switch (driver) {
    case "redis":
      instance = new RedisDriver();
      break;
    case "file":
      instance = new FileDriver();
      break;
    case "db":
      instance = new DbDriver();
      break;
    default:
      instance = new MemoryDriver();
  }
  return instance;
}

export function cacheKey(prefix: string, id: string): string {
  return `biop:${prefix}:${id}`;
}