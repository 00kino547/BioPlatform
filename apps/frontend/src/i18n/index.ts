// i18n runtime.
//
// This module owns the single i18next instance used by the whole app. It is the
// successor to the old "structure only" scaffold: the resources below are the
// locale files under src/locales/<lng>/<namespace>.json, loaded statically so a
// locale switch never triggers a network round-trip.
//
// Resolution order for the active locale:
//   1. the visitor's stored preference (localStorage),
//   2. their Accept-Language list (navigator.languages),
//   3. the instance's defaultLocale (config.yml `public.i18n`), then DEFAULT_LOCALE.
//
// Activation is gated by config.yml `public.i18n.enabled`, surfaced through
// GET /api/config (see InstanceConfigPublic.i18n in lib/api.ts). The gate is
// applied AFTER boot so the first paint uses the best available guess and the
// config fetch can correct it once it lands (see I18nConfigGate).
import i18n from "i18next";
import { initReactI18next } from "react-i18next";

// English resources (source of truth for every key).
import enCommon from "@/locales/en/common.json";
import enAuth from "@/locales/en/auth.json";
import enLanding from "@/locales/en/landing.json";
import enProfile from "@/locales/en/profile.json";
import enInvite from "@/locales/en/invite.json";
import enDashboard from "@/locales/en/dashboard.json";
import enAdmin from "@/locales/en/admin.json";
import enLegal from "@/locales/en/legal.json";
import enShared from "@/locales/en/shared.json";

// Spanish resources (English placeholder until the community translates them).
import esCommon from "@/locales/es/common.json";
import esAuth from "@/locales/es/auth.json";
import esLanding from "@/locales/es/landing.json";
import esProfile from "@/locales/es/profile.json";
import esInvite from "@/locales/es/invite.json";
import esDashboard from "@/locales/es/dashboard.json";
import esAdmin from "@/locales/es/admin.json";
import esLegal from "@/locales/es/legal.json";
import esShared from "@/locales/es/shared.json";

/**
 * Namespaces the UI may request. One file per surface so a translator can work
 * on the landing page without touching the admin panel, and so a locale can be
 * shipped incrementally.
 */
export const NAMESPACES = [
  "common",
  "auth",
  "landing",
  "profile",
  "invite",
  "dashboard",
  "admin",
  "legal",
  "shared",
] as const;
export type Namespace = (typeof NAMESPACES)[number];

/**
 * Locales bundled into the build. Mirrors the config.yml `public.i18n` defaults;
 * the exact set advertised at runtime comes from the instance config, and the
 * switcher only ever offers a subset of these (a locale with no bundle cannot be
 * selected).
 */
export const SUPPORTED_LOCALES = ["en", "es"] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

/** Locale served to visitors with no stored preference or Accept-Language match. */
export const DEFAULT_LOCALE: SupportedLocale = "en";

/** Locale shown when a requested translation is missing a key. */
export const FALLBACK_LOCALE: SupportedLocale = "en";

/** Locale files live under src/locales/<lng>/<namespace>.json. */
export const LOCALES_DIR = "src/locales";

/** localStorage key holding the visitor's explicit language choice. */
export const LOCALE_STORAGE_KEY = "i18n.locale";

/**
 * Languages written right-to-left. Used to set the document `dir` attribute so
 * the layout can mirror once such a locale is added (none ship today).
 */
const RTL_LANGUAGES = new Set(["ar", "he", "fa", "ur", "yi"]);

/**
 * Static resource bundle handed to i18next. Keyed by locale, then namespace.
 */
const resources = {
  en: {
    common: enCommon,
    auth: enAuth,
    landing: enLanding,
    profile: enProfile,
    invite: enInvite,
    dashboard: enDashboard,
    admin: enAdmin,
    legal: enLegal,
    shared: enShared,
  },
  es: {
    common: esCommon,
    auth: esAuth,
    landing: esLanding,
    profile: esProfile,
    invite: esInvite,
    dashboard: esDashboard,
    admin: esAdmin,
    legal: esLegal,
    shared: esShared,
  },
} as const;

/** Subset of the instance `public.i18n` block that drives the runtime. */
export interface I18nInstanceConfig {
  enabled: boolean;
  defaultLocale: string;
  fallbackLocale: string;
  locales: string[];
}

/**
 * Normalises a locale tag to its base language: "es-MX" -> "es", "EN" -> "en".
 */
function baseLanguage(tag: string): string {
  return tag.toLowerCase().split("-")[0];
}

/** Reads the stored preference, tolerating privacy modes that disable storage. */
export function readStoredLocale(): string | null {
  try {
    return localStorage.getItem(LOCALE_STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Persists an explicit choice. Failures are non-fatal (private browsing). */
export function writeStoredLocale(lng: string): void {
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, lng);
  } catch {
    // Storage unavailable — the choice simply does not persist.
  }
}

/** Clears the stored preference (used by tests and a future "reset" control). */
export function clearStoredLocale(): void {
  try {
    localStorage.removeItem(LOCALE_STORAGE_KEY);
  } catch {
    // Ignore.
  }
}

/** localStorage prefix marking that a locale's untranslated-notice was dismissed. */
export const NOTICE_DISMISSED_PREFIX = "i18n.notice.dismissed.";

/** True when the visitor dismissed the "partially translated" notice for `lng`. */
export function isNoticeDismissed(lng: string): boolean {
  try {
    return localStorage.getItem(NOTICE_DISMISSED_PREFIX + lng) === "1";
  } catch {
    return false;
  }
}

/** Remembers that the visitor dismissed the notice for `lng`. */
export function dismissNotice(lng: string): void {
  try {
    localStorage.setItem(NOTICE_DISMISSED_PREFIX + lng, "1");
  } catch {
    // Storage unavailable — the banner simply reappears next visit.
  }
}

/** Depth-first list of leaf key paths ("a.b.c") found in a resource object. */
function flattenKeys(obj: unknown, prefix = ""): string[] {
  if (!obj || typeof obj !== "object") return prefix ? [prefix] : [];
  const out: string[] = [];
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object") out.push(...flattenKeys(value, path));
    else out.push(path);
  }
  return out;
}

/**
 * Key paths (as "namespace:path") that exist in the fallback locale but are
 * absent from `locale`, i.e. the strings that would fall back to English. Used by
 * the untranslated-notice banner; an empty array means the locale is complete.
 */
export function getMissingKeys(
  locale: string,
  fallback: string = FALLBACK_LOCALE,
  namespaces: readonly string[] = NAMESPACES
): string[] {
  if (locale === fallback) return [];
  const missing: string[] = [];
  for (const ns of namespaces) {
    const baseBundle = i18n.getResourceBundle(fallback, ns) as unknown;
    if (!baseBundle) continue;
    const target = i18n.getResourceBundle(locale, ns) as unknown;
    const present = new Set(flattenKeys(target));
    for (const path of flattenKeys(baseBundle)) {
      if (!present.has(path)) missing.push(`${ns}:${path}`);
    }
  }
  return missing;
}

/**
 * Resolves the best locale from an explicit preference, then Accept-Language,
 * then the supplied fallback. Only tags present in `available` are returned, so
 * the caller never selects a locale with no bundled resources.
 */
export function resolveLocale(
  available: readonly string[] = SUPPORTED_LOCALES,
  preferred: string | null = null,
  fallback: string = DEFAULT_LOCALE
): string {
  const locales = available.length > 0 ? available : SUPPORTED_LOCALES;

  if (preferred) {
    const p = preferred.toLowerCase();
    // Return the CANONICAL tag as spelled in `available` — a stored "EN" or
    // "es-mx" must resolve to "en"/"es", never reach i18next with casing the
    // resource bundle does not use.
    if (locales.includes(preferred)) return preferred;
    if (locales.includes(p)) return p;
    const base = baseLanguage(p);
    if (locales.includes(base)) return base;
  }

  const navLangs =
    typeof navigator !== "undefined"
      ? navigator.languages ?? [navigator.language]
      : [];
  for (const raw of navLangs) {
    if (!raw) continue;
    const tag = raw.toLowerCase();
    if (locales.includes(tag)) return tag;
    const base = baseLanguage(tag);
    if (locales.includes(base)) return base;
  }

  return fallback;
}

/**
 * Reflects the active locale onto the document: `lang` for assistive tech and
 * search engines, `dir` for layout direction (RTL-ready).
 */
export function applyDocumentLanguage(lng: string): void {
  if (typeof document === "undefined") return;
  const base = baseLanguage(lng);
  document.documentElement.lang = lng;
  document.documentElement.dir = RTL_LANGUAGES.has(base) ? "rtl" : "ltr";
}

/** True once initI18n has run at least once. */
let initialized = false;

/**
 * Initialises (or re-targets) the i18next instance.
 *
 * Called synchronously at boot with no argument to get a best-guess locale on
 * screen immediately, then again by I18nConfigGate once /api/config resolves so
 * the `enabled` gate and the instance's locale set take effect. When `enabled`
 * is false the active locale is forced to the instance default, i.e. the UI is
 * pinned to one language and the switcher is hidden.
 */
export function initI18n(config?: Partial<I18nInstanceConfig> | null): typeof i18n {
  const available =
    config?.locales && config.locales.length > 0
      ? config.locales
      : [...SUPPORTED_LOCALES];
  const fallback = config?.fallbackLocale || FALLBACK_LOCALE;
  const defaultLocale = config?.defaultLocale || DEFAULT_LOCALE;

  const lng = config?.enabled
    ? resolveLocale(available, readStoredLocale(), defaultLocale)
    : defaultLocale;

  if (!initialized) {
    void i18n.use(initReactI18next).init({
      resources,
      lng,
      fallbackLng: fallback,
      ns: [...NAMESPACES],
      defaultNS: "common",
      // React already escapes rendered strings; i18next escaping would double-encode.
      interpolation: { escapeValue: false },
      returnNull: false,
    });
    initialized = true;
  } else if (i18n.language !== lng) {
    void i18n.changeLanguage(lng);
  }

  applyDocumentLanguage(i18n.language);
  return i18n;
}

/** The shared i18next instance. Import this only for imperative calls. */
export default i18n;
