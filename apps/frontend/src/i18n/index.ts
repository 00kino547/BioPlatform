// i18n — STRUCTURE ONLY. NOT WIRED, NOT ACTIVE.
//
// This module is the agreed landing point for the multi-language UI, but NOTHING
// here runs yet: no i18next dependency is installed, no component imports this
// module, and no string has been replaced with a translation key. The locale
// files it will eventually load ship alongside it so translators already have
// everything they need:
//
//   apps/frontend/src/locales/<lng>/*.json   (namespace files per surface)
//
// Why it exists now: the AGENTS.md rule says every new user-visible string must
// land in the locale files even while i18n is unfinished — so the KEY CONTRACT
// (locale set, default/fallback, namespaces) is pinned here today, and wiring
// later is purely additive.
//
// The runtime reading to come (once enabled):
//   - defaultLocale / fallbackLocale / locales come from config.yml
//     `public.i18n`, which GET /api/config already returns (see the
//     InstanceConfigPublic.i18n type in lib/api.ts).
//   - the backend placeholder GET /api/i18n/config and /api/i18n/locales
//     currently answer 503 `i18n_not_implemented` (routes/i18n.ts).
//   - locale resolution order: stored preference → Accept-Language → default.
//
// To activate later: add i18next + react-i18next, init here with the resources
// from locales/, wrap the App with the provider, and swap hardcoded strings for
// t() keys — keep every new string mirrored into locales/en + locales/es.

/**
 * Locale identifiers the UI may render. Mirrors the config.yml `public.i18n`
 * defaults; the exact set served at runtime comes from the instance config.
 */
export const SUPPORTED_LOCALES = ["en", "es"] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

/** Locale served to visitors with no stored preference or Accept-Language match. */
export const DEFAULT_LOCALE: SupportedLocale = "en";

/** Locale shown when a requested translation is missing a key. */
export const FALLBACK_LOCALE: SupportedLocale = "en";

/** Locale files live under src/locales/<lng>/<namespace>.json. */
export const LOCALES_DIR = "src/locales";

/**
 * Resolves the best available locale: an explicitly stored preference wins,
 * then the visitor's Accept-Language list is matched against the supported
 * locales, then `DEFAULT_LOCALE`. The two static fallbacks below are enough to
 * type the contract; the Accept-Language pass belongs to the future runtime.
 */
export function resolveLocale(preferred?: string): SupportedLocale {
  if (preferred && (SUPPORTED_LOCALES as readonly string[]).includes(preferred)) {
    return preferred as SupportedLocale;
  }
  return DEFAULT_LOCALE;
}

/**
 * Placeholder for the real i18n bootstrap. Intentionally left unimplemented:
 * creating it now would drag in i18next and activate behavior before the
 * structure is ready. Wire this when i18n is actually enabled.
 */
export function initI18n(): void {
  void LOCALES_DIR;
  void resolveLocale;
}