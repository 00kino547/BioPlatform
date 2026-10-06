import { prisma } from "./prisma.js";
import { cacheKey, getCacheDriver } from "./cache.js";

export const FEATURED_PROFILE_SETTING_KEY = "landing.featuredProfileUsername";

const FEATURED_PROFILE_CACHE_KEY = cacheKey("landing", "featuredProfileUsername");
const FEATURED_PROFILE_CACHE_TTL_MS = 60_000;

export async function getFeaturedProfileUsername(): Promise<string | null> {
  const cached = await getCacheDriver().get(FEATURED_PROFILE_CACHE_KEY);
  if (cached !== null) {
    return cached === "\u0000" ? null : cached;
  }
  const row = await prisma.systemSetting.findUnique({ where: { key: FEATURED_PROFILE_SETTING_KEY } });
  const value = row?.value?.trim();
  const result = value ? value : null;
  await getCacheDriver().set(FEATURED_PROFILE_CACHE_KEY, result ?? "\u0000", FEATURED_PROFILE_CACHE_TTL_MS);
  return result;
}

export async function setFeaturedProfileUsername(username: string): Promise<void> {
  const clean = username.trim().replace(/^@/, "");
  if (!clean) {
    await prisma.systemSetting.deleteMany({ where: { key: FEATURED_PROFILE_SETTING_KEY } });
  } else {
    await prisma.systemSetting.upsert({
      where: { key: FEATURED_PROFILE_SETTING_KEY },
      update: { value: clean },
      create: { key: FEATURED_PROFILE_SETTING_KEY, value: clean },
    });
  }
  await getCacheDriver().del(FEATURED_PROFILE_CACHE_KEY);
}