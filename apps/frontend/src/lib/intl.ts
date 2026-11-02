// Locale-aware date, number and currency formatting.
//
// The active locale is owned by the shared i18next instance (see @/i18n). It is
// resolved once at boot from the visitor's stored preference, their
// Accept-Language list, then the instance default, and re-targeted when the
// instance config lands. Reading `i18n.language` here — instead of hardcoding
// "en-US"/"en-GB" at each call site — keeps every rendered date, number and
// currency in lockstep with the language the rest of the UI is using.
import i18n from "@/i18n";

/**
 * The locale the UI is currently rendering in. Falls back to "en" when i18next
 * has not resolved a language yet (e.g. very early in boot).
 */
export function activeLocale(): string {
  return i18n.language || "en";
}

/** Coerces a value to a Date without losing an existing Date instance. */
function toDate(value: string | number | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

/** Locale-aware date + time, e.g. "9/30/2026, 2:15:00 PM". */
export function formatDateTime(
  value: string | number | Date,
  options?: Intl.DateTimeFormatOptions
): string {
  return toDate(value).toLocaleString(activeLocale(), options);
}

/** Locale-aware date only, e.g. "9/30/2026" or "30 Sep 2026". */
export function formatDate(
  value: string | number | Date,
  options?: Intl.DateTimeFormatOptions
): string {
  return toDate(value).toLocaleDateString(activeLocale(), options);
}

/** Locale-aware time only, e.g. "2:15:00 PM". */
export function formatTime(
  value: string | number | Date,
  options?: Intl.DateTimeFormatOptions
): string {
  return toDate(value).toLocaleTimeString(activeLocale(), options);
}

/** Locale-aware number, e.g. "1,234,567". */
export function formatNumber(
  value: number | string,
  options?: Intl.NumberFormatOptions
): string {
  return Number(value).toLocaleString(activeLocale(), options);
}

/**
 * Locale-aware currency. `cents` is the minor unit (integer cents), matching the
 * rest of the app's money handling.
 */
export function formatCurrency(cents: number, currency: string): string {
  return new Intl.NumberFormat(activeLocale(), { style: "currency", currency }).format(
    cents / 100
  );
}
