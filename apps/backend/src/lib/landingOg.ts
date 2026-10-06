import { createHash } from "node:crypto";
import { getEnv } from "../config/env.js";
import { renderLandingOgCard } from "./ogCard.js";
import { cacheKey, getCacheDriver } from "./cache.js";

const LANDING_OG_CACHE_KEY = cacheKey("og", "landing");
const LANDING_OG_TTL_MS = 3600000;

export function landingOgKey(): string {
  const env = getEnv();
  return [env.APP_NAME, env.APP_TAGLINE, env.APP_URL].join("\u0000");
}

function hash(value: string): string {
  return createHash("sha1").update(value).digest("hex").slice(0, 16);
}

export async function renderLandingOgCached(): Promise<{ buffer: Buffer; etag: string }> {
  const key = landingOgKey();
  const etag = `"${hash(key)}"`;
  const now = Date.now();
  const driver = getCacheDriver();

  try {
    const persisted = await driver.get(LANDING_OG_CACHE_KEY);
    if (persisted) {
      const entry = JSON.parse(persisted) as {
        key?: string;
        base64?: string;
        createdAt?: number;
      };
      if (entry.key === key && typeof entry.base64 === "string" && typeof entry.createdAt === "number" && now - entry.createdAt < LANDING_OG_TTL_MS) {
        return { buffer: Buffer.from(entry.base64, "base64"), etag };
      }
    }
  } catch {
    // ignore corrupt cache
  }

  const env = getEnv();
  const buffer = renderLandingOgCard({ appName: env.APP_NAME, appTagline: env.APP_TAGLINE, url: env.APP_URL });
  await driver.set(
    LANDING_OG_CACHE_KEY,
    JSON.stringify({ key, base64: buffer.toString("base64"), createdAt: now }),
    LANDING_OG_TTL_MS
  );
  return { buffer, etag };
}