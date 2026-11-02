// Compact language switcher: a globe icon plus a native <select>.
//
// Rendered only when the instance enables multi-language AND offers more than one
// locale, so single-language deployments show nothing at all. Using a native
// <select> keeps keyboard and screen-reader support for free and avoids pulling
// in a dropdown library.
import { useTranslation } from "react-i18next";
import { Globe } from "lucide-react";
import { useI18n } from "@/i18n/useI18n";

/**
 * Human-readable name for a locale tag in the currently active language, e.g.
 * "es" -> "Spanish" / "Español". Falls back to the upper-cased tag when
 * Intl.DisplayNames is unavailable (old engines, some test runners).
 */
function localeLabel(tag: string, inLocale: string): string {
  try {
    const display = new Intl.DisplayNames([inLocale], { type: "language" });
    return display.of(tag) ?? tag.toUpperCase();
  } catch {
    return tag.toUpperCase();
  }
}

export function LanguageSwitcher({ className = "" }: { className?: string }) {
  const { t } = useTranslation("common");
  const { locale, locales, enabled, setLocale } = useI18n();

  if (!enabled || locales.length < 2) return null;

  // Guard against a stored preference that the instance no longer offers.
  const active = locales.includes(locale) ? locale : locales[0];

  return (
    <label className={`relative inline-flex items-center gap-1.5 ${className}`}>
      <Globe aria-hidden="true" className="h-4 w-4 text-zinc-400" />
      <span className="sr-only">{t("language.label")}</span>
      <select
        aria-label={t("language.label")}
        value={active}
        onChange={(event) => setLocale(event.target.value)}
        className="appearance-none bg-transparent text-sm text-zinc-400 hover:text-white transition-colors cursor-pointer pr-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/60 rounded"
      >
        {locales.map((lng) => (
          <option key={lng} value={lng} className="bg-zinc-900 text-white">
            {localeLabel(lng, active)}
          </option>
        ))}
      </select>
      <svg
        aria-hidden="true"
        viewBox="0 0 12 12"
        className="pointer-events-none absolute right-0 h-3 w-3 text-zinc-500"
      >
        <path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    </label>
  );
}
