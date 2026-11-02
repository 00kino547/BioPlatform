// React binding for the i18n runtime.
//
// Reads the instance `public.i18n` block (via useInstanceConfig) and the live
// i18next instance, and exposes just what a component needs to render or change
// the language. Components that only need translation strings should call
// useTranslation directly; this hook is for the switcher and anything that must
// know whether multi-language is enabled.
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useInstanceConfig } from "@/lib/useInstanceConfig";
import { applyDocumentLanguage, writeStoredLocale } from "@/i18n";

export interface UseI18nResult {
  /** The locale currently rendered (base tag, e.g. "en"). */
  locale: string;
  /** Locales offered by the instance. Empty when i18n is disabled. */
  locales: string[];
  /** Whether config.yml `public.i18n.enabled` is on. */
  enabled: boolean;
  /** Switches language, persists the choice, and updates <html lang>/<dir>. */
  setLocale: (lng: string) => void;
}

export function useI18n(): UseI18nResult {
  const { i18n } = useTranslation();
  const config = useInstanceConfig();
  const cfg = config?.i18n;

  // A missing config (fetch failed, or a build with no config.yml) is treated as
  // disabled: the switcher never appears unless the instance opts in.
  const enabled = cfg?.enabled ?? false;
  const locales = enabled && cfg?.locales && cfg.locales.length > 0 ? cfg.locales : [];

  const setLocale = useCallback(
    (lng: string) => {
      if (lng === i18n.resolvedLanguage) return;
      void i18n.changeLanguage(lng);
      writeStoredLocale(lng);
      applyDocumentLanguage(lng);
    },
    [i18n]
  );

  return {
    locale: i18n.resolvedLanguage ?? i18n.language,
    locales,
    enabled,
    setLocale,
  };
}
