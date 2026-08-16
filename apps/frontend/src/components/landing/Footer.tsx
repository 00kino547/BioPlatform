import { Container } from "@/components/layout/Container";
import { ScrollReveal } from "@/components/ui/scroll-reveal";
import { VersionBadge } from "@/components/updates/VersionBadge";
import { branding } from "@/config/branding";

function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
    </svg>
  );
}

const footerLinks = {
  Product: [
    { label: "Features", href: "#features" },
    { label: "Pricing", href: "#pricing" },
    { label: "Showcase", href: "#showcase" },
    { label: "Changelog", href: "https://github.com/00kino547/BioPlatform/blob/main/CHANGELOG.md" },
  ],
  Resources: [
    { label: "Documentation", href: branding.docsUrl },
    { label: "Status", href: branding.statusUrl || "#" },
  ],
  Legal: [
    { label: "Privacy Policy", href: "/privacy" },
    { label: "Terms of Service", href: "/terms" },
    { label: "Contact", href: branding.contactUrl },
  ],
};

export function Footer() {
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
                  {branding.tagline}
                </p>
                <div className="mt-5 flex items-center gap-3">
                  <a
                    href={branding.githubUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-800/50 border border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800 hover:border-zinc-700 transition-all"
                    aria-label="GitHub"
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
                    {links.map((link) => (
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
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </ScrollReveal>
        </div>

        <div className="border-t border-zinc-800/60 py-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-zinc-600">
            &copy; {new Date().getFullYear()} {branding.name}. All rights reserved.
          </p>
          <div className="flex items-center gap-3">
            <VersionBadge />
            <a
              href={branding.githubUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
            >
              Powered by {branding.name}
            </a>
          </div>
        </div>
      </Container>
    </footer>
  );
}
