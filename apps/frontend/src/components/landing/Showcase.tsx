import { useState } from "react";
import { Container } from "@/components/layout/Container";
import { ScrollReveal } from "@/components/ui/scroll-reveal";
import { ExternalLink, MoreHorizontal } from "lucide-react";
import { branding } from "@/config/branding";
import { PlatformIcon } from "@/components/ui/PlatformIcon";

const themes = [
  { name: "Midnight", bg: "#09090b", cardBg: "rgba(24,24,27,0.6)", text: "#e4e4e7", accent: "#7c3aed", banner: "from-violet-600 via-violet-500 to-cyan-500" },
  { name: "Ocean", bg: "#0c1222", cardBg: "rgba(15,23,42,0.7)", text: "#e2e8f0", accent: "#0ea5e9", banner: "from-cyan-500 via-blue-500 to-indigo-500" },
  { name: "Sunset", bg: "#1a0a0a", cardBg: "rgba(45,10,10,0.6)", text: "#fef2f2", accent: "#f97316", banner: "from-orange-500 via-rose-500 to-pink-500" },
  { name: "Forest", bg: "#0a1a0f", cardBg: "rgba(10,30,15,0.6)", text: "#ecfdf5", accent: "#22c55e", banner: "from-emerald-500 via-teal-500 to-cyan-500" },
];

const mockLinks = [
  { platform: "GitHub", url: "https://github.com" },
  { platform: "Twitter", url: "https://x.com" },
  { platform: "Discord", url: "alexmorgan" },
  { platform: "Email", url: "mailto:alex@example.com" },
];

function BrowserMockup({ themeIndex }: { themeIndex: number }) {
  const t = themes[themeIndex];

  return (
    <div className="mx-auto w-full max-w-lg rounded-2xl border border-zinc-800/80 bg-zinc-900/80 overflow-hidden shadow-2xl shadow-violet-600/5">
      <div className="flex items-center gap-2 px-4 py-3 bg-zinc-900/90 border-b border-zinc-800/60">
        <div className="flex gap-1.5">
          <div className="h-3 w-3 rounded-full bg-zinc-700" />
          <div className="h-3 w-3 rounded-full bg-zinc-700" />
          <div className="h-3 w-3 rounded-full bg-zinc-700" />
        </div>
        <div className="flex-1 mx-2">
          <div className="mx-auto max-w-xs h-6 rounded-md bg-zinc-800/80 flex items-center justify-center">
            <span className="text-[11px] text-zinc-500 font-mono">{branding.url?.replace(/^https?:\/\//, "")}/alexmorgan</span>
          </div>
        </div>
        <MoreHorizontal className="h-4 w-4 text-zinc-600" />
      </div>

      <div style={{ backgroundColor: t.bg }} className="transition-colors duration-500">
        <div className="px-6 pt-6 pb-2">
          <div className={`h-28 rounded-2xl bg-gradient-to-br ${t.banner} relative overflow-hidden transition-all duration-500`}>
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,rgba(255,255,255,0.1),transparent)]" />
          </div>
        </div>

        <div className="px-6 -mt-8 relative z-10">
          <div className="rounded-2xl p-6 text-center transition-colors duration-500" style={{ backgroundColor: t.cardBg }}>
            <div
              className="mx-auto h-20 w-20 rounded-full flex items-center justify-center text-2xl font-bold text-white ring-4 ring-black/30 mb-4"
              style={{ backgroundColor: t.accent }}
            >
              A
            </div>

            <h3 className="text-lg font-bold mb-0.5" style={{ color: t.text }}>Alex Morgan</h3>
            <p className="text-sm mb-3" style={{ color: `${t.text}88` }}>@alexmorgan</p>
            <p className="text-sm leading-relaxed mb-5" style={{ color: `${t.text}cc` }}>
              Designer &amp; developer building the future of digital identity.
            </p>

            <div className="flex flex-col items-center gap-2">
              {mockLinks.map((link) => {
                const isDiscordUsername = link.platform === "Discord" && !link.url.startsWith("http");
                const displayUrl = link.url.startsWith("mailto:") ? link.url.slice(7) : link.url;

                return (
                  <div
                    key={link.platform}
                    className="flex items-center gap-3 w-full max-w-sm px-4 py-2.5 rounded-xl text-sm font-medium transition-all"
                    style={{
                      backgroundColor: `${t.accent}12`,
                      color: t.accent,
                      border: `1px solid ${t.accent}25`,
                    }}
                  >
                    <PlatformIcon
                      platform={link.platform}
                      className="h-4 w-4 flex-shrink-0"
                      color={t.accent}
                    />
                    <div className="flex flex-col items-start min-w-0 flex-1">
                      <span className="text-[10px] font-semibold uppercase tracking-wider opacity-70">
                        {link.platform}
                      </span>
                      <span className="text-xs opacity-60 truncate w-full text-left">
                        {displayUrl}
                      </span>
                    </div>
                    {!isDiscordUsername && (
                      <ExternalLink className="h-3 w-3 opacity-40 flex-shrink-0" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <p className="text-center text-[10px] mt-4 pb-4" style={{ color: `${t.text}44` }}>
          Powered by {branding.name}
        </p>
      </div>
    </div>
  );
}

function ThemeSelector({ active, onSelect }: { active: number; onSelect: (i: number) => void }) {
  return (
    <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-5 sm:p-6">
      <p className="text-sm font-medium text-white mb-4">Theme Customization</p>
      <div className="grid grid-cols-4 gap-2.5">
        {themes.map((theme, i) => (
          <button
            key={theme.name}
            onClick={() => onSelect(i)}
            className={`relative rounded-xl p-3 transition-all duration-200 cursor-pointer ${
              active === i
                ? "ring-2 ring-violet-500 ring-offset-2 ring-offset-zinc-950"
                : "hover:ring-1 hover:ring-zinc-700 hover:ring-offset-1 hover:ring-offset-zinc-950"
            }`}
          >
            <div
              className="h-14 sm:h-16 rounded-lg mb-2.5 transition-transform duration-200"
              style={{ backgroundColor: theme.accent }}
            />
            <p className="text-xs font-medium text-white">{theme.name}</p>
            {active === i && (
              <div className="absolute top-1.5 right-1.5 h-4 w-4 rounded-full bg-violet-500 flex items-center justify-center animate-scale-in">
                <svg className="h-2.5 w-2.5 text-white" viewBox="0 0 12 12" fill="none">
                  <path d="M10 3L4.5 8.5L2 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

function MobileMockup({ themeIndex }: { themeIndex: number }) {
  const t = themes[themeIndex];

  return (
    <div className="mx-auto w-[340px] rounded-[2rem] border-2 border-zinc-800/80 bg-zinc-950 p-3 shadow-2xl shadow-violet-600/5">
      <div className="rounded-[1.5rem] overflow-hidden" style={{ backgroundColor: t.bg }}>
        <div className="h-8 flex items-center justify-center">
          <div className="h-1.5 w-24 rounded-full bg-zinc-800" />
        </div>
        <div className="relative px-6 pb-8">
          <div className="flex justify-center mb-4">
            <div
              className="h-20 w-20 rounded-full border-2 flex items-center justify-center text-2xl font-bold text-white -mt-4"
              style={{ borderColor: t.bg, backgroundColor: t.accent }}
            >
              A
            </div>
          </div>
          <div className="text-center mb-4">
            <p className="text-lg font-bold" style={{ color: t.text }}>Alex Morgan</p>
            <p className="text-xs" style={{ color: `${t.text}88` }}>@alexmorgan</p>
          </div>
          <div className="space-y-2.5">
            {["GitHub", "Twitter / X", "Discord"].map((label) => (
              <div
                key={label}
                className="rounded-xl px-4 py-3 text-sm font-medium text-center flex items-center justify-center gap-2.5"
                style={{
                  backgroundColor: `${t.accent}12`,
                  color: t.accent,
                  border: `1px solid ${t.accent}25`,
                }}
              >
                <PlatformIcon platform={label.split(" ")[0]} className="h-4 w-4" color={t.accent} />
                {label}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function Showcase() {
  const [activeTheme, setActiveTheme] = useState(0);

  return (
    <section id="showcase" className="py-24 sm:py-32 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-background via-violet-950/[0.03] to-background" />

      <Container className="relative z-10">
        <ScrollReveal>
          <div className="text-center max-w-2xl mx-auto mb-16 sm:mb-20">
            <p className="text-sm font-semibold uppercase tracking-widest text-violet-400 mb-4">
              Showcase
            </p>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-white leading-tight">
              See it in action.
            </h2>
            <p className="mt-5 text-lg text-zinc-400 max-w-xl mx-auto">
              Beautiful profiles, powerful customization. This is what your page could look like.
            </p>
          </div>
        </ScrollReveal>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-6 items-start max-w-6xl mx-auto">
          <ScrollReveal className="lg:col-span-7" delay={100}>
            <BrowserMockup themeIndex={activeTheme} />
          </ScrollReveal>

          <div className="lg:col-span-5 flex flex-col gap-5">
            <ScrollReveal delay={200}>
              <ThemeSelector active={activeTheme} onSelect={setActiveTheme} />
            </ScrollReveal>

            <ScrollReveal delay={300}>
              <MobileMockup themeIndex={activeTheme} />
            </ScrollReveal>
          </div>
        </div>
      </Container>
    </section>
  );
}
