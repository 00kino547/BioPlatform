import { useTranslation } from "react-i18next";
import { Container } from "@/components/layout/Container";
import { ScrollReveal } from "@/components/ui/scroll-reveal";
import { VersionBadge } from "@/components/updates/VersionBadge";
import { branding } from "@/config/branding";
import { useInstanceConfig } from "@/lib/useInstanceConfig";

function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
    </svg>
  );
}

export function Footer() {
  const { t } = useTranslation("landing");
  const onCookiePrefs = () => window.dispatchEvent(new CustomEvent("bio:open-cookie-settings"));
  const instance = useInstanceConfig();
  // config.yml landing copy wins; branding.* is the zero-config fallback.
  const blurb = instance?.landing.footerAbout.trim() || instance?.landing.tagline.trim() || branding.tagline;

  // Link labels are resolved through i18n at render time; the icon/href/action
  // wiring stays static so only the copy is translated.
  const footerLinks = {
    [t("footer.categories.product")]: [
      { label: t("footer.links.features"), href: "#features" },
      { label: t("footer.links.pricing"), href: "#pricing" },
      { label: t("common:nav.showcase"), href: "#showcase" },
      { label: t("footer.links.changelog"), href: `${branding.githubUrl}/blob/main/CHANGELOG.md` },
    ],
    [t("footer.categories.resources")]: [
      { label: t("footer.links.documentation"), href: branding.docsUrl },
      { label: t("footer.links.status"), href: branding.statusUrl || "#" },
    ],
    [t("footer.categories.legal")]: [
      { label: t("footer.links.privacyPolicy"), href: "/privacy" },
      { label: t("footer.links.termsOfService"), href: "/terms" },
      { label: t("footer.links.contact"), href: branding.contactUrl },
    ],
    [t("footer.categories.preferences")]: [{ label: t("footer.links.cookiePreferences"), action: "cookies" as const }],
  };

  return (
    <footer className="relative">
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-violet-500/30 to-transparent" />

      <Container>
        <div className="py-16 sm:py-20">
          <ScrollReveal>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-10 md:gap-8">
              <div className="col-span-2 md:col-span-1">
                <a href="/" className="flex items-center gap-2.5 mb-5">
                  <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-violet-500 to-cyan-500 flex items-center justify-center text-sm font-bold text-white shadow-lg shadow-violet-500/20">
                    {branding.name.charAt(0)}
                  </div>
                  <span className="text-lg font-semibold text-white tracking-tight">
                    {branding.name}
                  </span>
                </a>
                <p className="text-sm text-zinc-500 leading-relaxed max-w-[240px]">
                  {blurb}
                </p>
                <div className="mt-5 flex items-center gap-3">
                  <a
                    href={branding.githubUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-800/50 border border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800 hover:border-zinc-700 transition-all"
                    aria-label={t("footer.githubAria")}
                  >
                    <GitHubIcon className="h-4 w-4" />
                  </a>
                </div>
              </div>

              {Object.entries(footerLinks).map(([category, links]) => (
                <div key={category}>
                  <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-4">
                    {category}
                  </h4>
                  <ul className="space-y-3">
                    {links.map((link) => {
                      if ("action" in link) {
                        return (
                          <li key={link.label}>
                            <button
                              type="button"
                              onClick={onCookiePrefs}
                              className="text-sm text-zinc-500 hover:text-white transition-colors cursor-pointer"
                            >
                              {link.label}
                            </button>
                          </li>
                        );
                      }
                      return (
                        <li key={link.label}>
                          <a
                            href={link.href}
                            target={link.href.startsWith("http") ? "_blank" : undefined}
                            rel={link.href.startsWith("http") ? "noopener noreferrer" : undefined}
                            className="text-sm text-zinc-500 hover:text-white transition-colors"
                          >
                            {link.label}
                          </a>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </ScrollReveal>
        </div>

        <div className="border-t border-zinc-800/60 py-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-zinc-600">
            {t("footer.copyright", { year: new Date().getFullYear(), name: branding.name })}
          </p>
          <div className="flex items-center gap-3">
            <VersionBadge />
            <a
              href={branding.githubUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
            >
              {t("footer.poweredBy", { name: branding.name })}
            </a>
          </div>
        </div>
      </Container>
    </footer>
  );
}
