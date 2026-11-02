// "Partially translated" notice.
//
// Shown when the active locale is missing keys that exist in the fallback, i.e.
// the page would otherwise silently mix languages. It is intentionally low-key
// (a small dismissible card) and never blocks the UI. Dismissal is remembered
// per locale so switching languages can surface it again.
//
// With the shipped placeholder locales (es is currently an English mirror) every
// key is present, so this renders nothing until a locale is genuinely partial.
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { useI18n } from "@/i18n/useI18n";
import { FALLBACK_LOCALE, getMissingKeys, isNoticeDismissed, dismissNotice } from "@/i18n";

export function UntranslatedNotice() {
  const { t } = useTranslation("common");
  const { locale, enabled } = useI18n();
  const [dismissed, setDismissed] = useState(() => isNoticeDismissed(locale));

  // Re-evaluate the dismissal flag whenever the active locale changes.
  useEffect(() => {
    setDismissed(isNoticeDismissed(locale));
  }, [locale]);

  if (!enabled || locale === FALLBACK_LOCALE || dismissed) return null;
  if (getMissingKeys(locale).length === 0) return null;

  return (
    <div
      role="status"
      className="fixed bottom-4 left-4 z-40 flex max-w-sm items-start gap-3 rounded-xl border border-zinc-800/80 bg-zinc-900/95 px-4 py-3 text-sm text-zinc-300 shadow-lg backdrop-blur"
    >
      <p className="flex-1 leading-snug">{t("untranslatedNotice.message")}</p>
      <button
        type="button"
        onClick={() => {
          dismissNotice(locale);
          setDismissed(true);
        }}
        aria-label={t("untranslatedNotice.dismiss")}
        className="-mr-1 -mt-1 rounded p-1 text-zinc-500 transition-colors hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/60"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
