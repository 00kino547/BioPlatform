import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { branding } from "@/config/branding";
import { AppFooter } from "@/components/layout/AppFooter";
import { PolicySection } from "@/components/legal/policyText";
export function PolicyShell({
  title,
  versionDate,
  sections,
  subsections,
}: {
  title: string;
  versionDate: string;
  /** Top-level numbered sections. */
  sections: PolicySection[];
  /** Conditionally rendered subsections of section 5, numbered from 5.1. */
  subsections: PolicySection[];
}) {
  const { t } = useTranslation("legal");
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-zinc-800/80 bg-zinc-900/30">
        <div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-4">
          <Link to="/" className="text-lg font-bold text-white tracking-tight">
            {branding.name}
          </Link>
          <Link to="/" className="text-sm text-zinc-400 hover:text-white transition-colors">
            {t("policyShell.backToHome")}
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-12 sm:py-16">
        <h1 className="text-3xl font-bold text-white mb-2">{title}</h1>
        <p className="text-sm text-zinc-500 mb-8">{t("policyShell.lastUpdated", { date: versionDate })}</p>

        <div className="prose prose-invert prose-zinc max-w-none space-y-8 text-sm leading-relaxed">
          {sections.map((section, index) => (
            <section key={section.id}>
              <h2 className="text-xl font-semibold text-white mb-3">
                {t("policyShell.sectionHeading", { number: index + 1, title: section.title })}
              </h2>
              {section.node ?? section.paragraphs.map((text, i) => (
                <p key={i} className={i === 0 ? "text-zinc-400" : "text-zinc-400 mt-2"}>
                  {text}
                </p>
              ))}
              {section.extra}
              {index === 4 && subsections.length > 0 ? (
                <div className="mt-8 space-y-8">
                  {subsections.map((sub, subIndex) => (
                    <section key={sub.id}>
                      <h2 className="text-xl font-semibold text-white mb-3">
                        {t("policyShell.subsectionHeading", { number: subIndex + 1, title: sub.title })}
                      </h2>
                      {sub.node ?? sub.paragraphs.map((text, i) => (
                        <p key={i} className={i === 0 ? "text-zinc-400" : "text-zinc-400 mt-2"}>
                          {text}
                        </p>
                      ))}
                      {sub.extra}
                    </section>
                  ))}
                </div>
              ) : null}
            </section>
          ))}
        </div>
      </main>

      <AppFooter />
    </div>
  );
}
