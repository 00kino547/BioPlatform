import { Prisma, SeasonalTheme } from "@prisma/client";
import { prisma } from "./prisma.js";
import { cacheKey, getCacheDriver } from "./cache.js";

export const SEASONAL_CONFIG_KEY = "seasonalThemes.config";

const ACTIVE_THEME_CACHE_KEY = cacheKey("seasonal", "activeTheme");
const ACTIVE_THEME_CACHE_TTL_MS = 60_000;

export interface SeasonalConfig {
  enabled: boolean; // master: seasonal theming active at all
  autoSchedule: boolean; // automatic scheduling
  respectUserPreferences: boolean; // user's decoration toggle respected when true
}

export interface ResolvedSeasonalTheme {
  slug: string;
  label: string;
  emoji: string | null;
  kind: string;
  config: Record<string, unknown>;
}

export const DEFAULT_SEASONAL_CONFIG: SeasonalConfig = {
  enabled: false,
  autoSchedule: true,
  respectUserPreferences: true,
};

export async function getSeasonalConfig(): Promise<SeasonalConfig> {
  const setting = await prisma.systemSetting.findUnique({ where: { key: SEASONAL_CONFIG_KEY } });
  if (!setting) return DEFAULT_SEASONAL_CONFIG;
  try {
    return { ...DEFAULT_SEASONAL_CONFIG, ...JSON.parse(setting.value) };
  } catch {
    return DEFAULT_SEASONAL_CONFIG;
  }
}

export async function setSeasonalConfig(config: SeasonalConfig): Promise<void> {
  await prisma.systemSetting.upsert({
    where: { key: SEASONAL_CONFIG_KEY },
    update: { value: JSON.stringify(config) },
    create: { key: SEASONAL_CONFIG_KEY, value: JSON.stringify(config) },
  });
  await invalidateSeasonalThemeCache();
}

// Returns [month, day] for "today" using the server's local date. Month/day are
// 1-indexed to match the stored schedule windows.
function todayMonthDay(now: Date = new Date()): { month: number; day: number } {
  return { month: now.getMonth() + 1, day: now.getDate() };
}

// Does the date fall within a (possibly year-wrapping) month/day window?
function inWindow(today: { month: number; day: number }, startMonth?: number | null, startDay?: number | null, endMonth?: number | null, endDay?: number | null): boolean {
  if (!startMonth || !startDay || !endMonth || !endDay) return false;
  const cur = today.month * 100 + today.day;
  const start = startMonth * 100 + startDay;
  const end = endMonth * 100 + endDay;
  if (start <= end) {
    return cur >= start && cur <= end;
  }
  // year-wrapping window (e.g. Dec 1 -> Jan 8)
  return cur >= start || cur <= end;
}

export interface ResolvedResult {
  theme: ResolvedSeasonalTheme | null;
  source: "override" | "schedule" | "christmas-always" | "none";
}

// Resolve which seasonal theme is active for the whole platform given the
// admin config (master switch, manual override, automatic schedule).
export async function resolveActiveSeasonalTheme(): Promise<ResolvedResult> {
  const cached = await getCacheDriver().get(ACTIVE_THEME_CACHE_KEY);
  if (cached !== null) {
    try {
      return JSON.parse(cached) as ResolvedResult;
    } catch {
      // ignore corrupt cache
    }
  }
  const result = await resolveActiveSeasonalThemeUncached();
  await getCacheDriver().set(ACTIVE_THEME_CACHE_KEY, JSON.stringify(result), ACTIVE_THEME_CACHE_TTL_MS);
  return result;
}

export async function invalidateSeasonalThemeCache(): Promise<void> {
  await getCacheDriver().del(ACTIVE_THEME_CACHE_KEY);
}

async function resolveActiveSeasonalThemeUncached(): Promise<ResolvedResult> {
  const config = await getSeasonalConfig();
  const today = todayMonthDay();

  // Master off -> nothing, unless admin forced a theme via override.
  if (!config.enabled) {
    return { theme: null, source: "none" };
  }

  const themes = await prisma.seasonalTheme.findMany({
    where: { allowedByAdmin: true },
  });

  // 1. Manual override (admin forced) beats everything.
  const overrideOn = themes.find((t) => t.overrideState === "on");
  if (overrideOn) {
    return { theme: serializeTheme(overrideOn), source: "override" };
  }

  // 2. If scheduling is off, none active by schedule.
  if (!config.autoSchedule) {
    return { theme: null, source: "none" };
  }

  // 3. Automatic scheduling: enabled themes whose window covers today.
  const scheduled = themes.filter(
    (t) => t.enabled && inWindow(today, t.startMonth, t.startDay, t.endMonth, t.endDay)
  );
  if (scheduled.length === 0) {
    return { theme: null, source: "none" };
  }

  // Holiday beats season; among the same kind, the higher sortOrder takes priority.
  const holiday = scheduled.find((t) => t.kind === "holiday");
  const pick = holiday ?? [...scheduled].sort((a, b) => b.sortOrder - a.sortOrder)[0];
  return { theme: serializeTheme(pick), source: "schedule" };
}

function serializeTheme(t: SeasonalTheme): ResolvedSeasonalTheme {
  let config: Record<string, unknown> = {};
  if (t.config && typeof t.config === "object") {
    config = t.config as Record<string, unknown>;
  }
  return {
    slug: t.slug,
    label: t.label,
    emoji: t.emoji,
    kind: t.kind,
    config,
  };
}

// Resolve the effective theme for a specific profile, honoring that profile's
// user preference toggles and the admin's "respect user preferences" flag.
export async function resolveProfileSeasonalTheme(profile: {
  theme?: Prisma.JsonValue;
}): Promise<ResolvedResult> {
  const themePrefs = (profile.theme ?? {}) as { seasonalDecorations?: boolean; alwaysAllowChristmas?: boolean };
  const decorations = themePrefs.seasonalDecorations ?? false;
  const alwaysChristmas = themePrefs.alwaysAllowChristmas ?? false;

  // Christmas-always: applies regardless of everything, even an admin disable.
  if (alwaysChristmas) {
    const christmas = await prisma.seasonalTheme.findFirst({
      where: { slug: "christmas", allowedByAdmin: true },
    });
    if (christmas) {
      return { theme: serializeTheme(christmas), source: "christmas-always" };
    }
  }

  const config = await getSeasonalConfig();

  // Determine the global/admin active theme (master switch, override, schedule).
  const global = await resolveActiveSeasonalTheme();

  // If the admin respects user preferences and this user disabled decorations,
  // suppress the global theme for this profile.
  if (config.respectUserPreferences && !decorations) {
    return { theme: null, source: "none" };
  }

  // Otherwise the user opted in (or admin doesn't respect prefs) -> apply global.
  return global;
}
