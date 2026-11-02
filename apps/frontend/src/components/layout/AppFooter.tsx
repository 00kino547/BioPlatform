import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { VersionBadge } from "@/components/updates/VersionBadge";
import { branding } from "@/config/branding";

export function AppFooter() {
  const { t } = useTranslation("common");
  return (
    <footer className="border-t border-zinc-800/60 bg-zinc-900/20">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 py-6 sm:flex-row sm:px-6 lg:px-8">
        <p className="text-xs text-zinc-600">
          {t("footer.copyright", { year: new Date().getFullYear(), name: branding.name })}
        </p>
        <div className="flex flex-wrap items-center justify-center gap-4">
          <VersionBadge />
          <Link to="/privacy" className="text-xs text-zinc-500 hover:text-white transition-colors">
            {t("footer.privacy")}
          </Link>
          <Link to="/terms" className="text-xs text-zinc-500 hover:text-white transition-colors">
            {t("footer.terms")}
          </Link>
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent("bio:open-cookie-settings"))}
            className="text-xs text-zinc-500 hover:text-white transition-colors cursor-pointer"
          >
            {t("footer.cookiePreferences")}
          </button>
          <Link to="/api-docs" className="text-xs text-zinc-500 hover:text-white transition-colors">
            {t("footer.api")}
          </Link>
          <a
            href={branding.githubUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-zinc-500 hover:text-white transition-colors"
          >
            {t("footer.github")}
          </a>
        </div>
      </div>
    </footer>
  );
}
