import { useState } from "react";
import { Link } from "react-router-dom";
import { Eye } from "lucide-react";
import { Container } from "@/components/layout/Container";
import { ScrollReveal } from "@/components/ui/scroll-reveal";
import { LAYOUT_META } from "@/components/ui/LayoutSelector";
import { branding } from "@/config/branding";
import type { LayoutName } from "@/lib/api";
import { useLandingConfig } from "@/lib/useLandingConfig";
import { SampleProfilePreview, type SeasonalPreviewConfig } from "@/components/landing/SampleProfilePreview";

const themes: { name: string; tier: "free" | "premium" | "enterprise"; config: SeasonalPreviewConfig }[] = [
  { name: "Midnight", tier: "free", config: { bg: "#09090b", cardBg: "rgba(24,24,27,0.6)", text: "#e4e4e7", accent: "#7c3aed" } },
  { name: "Ocean", tier: "free", config: { bg: "#0c1222", cardBg: "rgba(15,23,42,0.7)", text: "#e2e8f0", accent: "#0ea5e9" } },
  { name: "Sunset", tier: "free", config: { bg: "#1a0a0a", cardBg: "rgba(45,10,10,0.6)", text: "#fef2f2", accent: "#f97316" } },
  { name: "Forest", tier: "free", config: { bg: "#0a1a0f", cardBg: "rgba(10,30,15,0.6)", text: "#ecfdf5", accent: "#22c55e" } },
  { name: "Aurora", tier: "premium", config: { bg: "#071426", cardBg: "rgba(10,25,45,0.65)", text: "#e0f2fe", accent: "#22d3ee" } },
  { name: "Royal", tier: "premium", config: { bg: "#0b0712", cardBg: "rgba(28,17,42,0.65)", text: "#f5f3ff", accent: "#a78bfa" } },
  { name: "Golden", tier: "premium", config: { bg: "#120d04", cardBg: "rgba(35,28,10,0.6)", text: "#fffbeb", accent: "#f59e0b" } },
  { name: "Obsidian", tier: "enterprise", config: { bg: "#05060a", cardBg: "rgba(16,18,26,0.7)", text: "#eef2ff", accent: "#34d399" } },
  { name: "Nebula", tier: "enterprise", config: { bg: "#0a0614", cardBg: "rgba(30,10,45,0.6)", text: "#fae8ff", accent: "#d946ef" } },
  { name: "Pearl", tier: "enterprise", config: { bg: "#f4f1eb", cardBg: "rgba(255,255,255,0.85)", text: "#1c1917", accent: "#b45309" } },
];

export function Showcase() {
  const [activeTheme, setActiveTheme] = useState(0);
  const [activeLayout, setActiveLayout] = useState<LayoutName>("default");
  const t = themes[activeTheme];
  const landingConfig = useLandingConfig();

  return (
    <section id="showcase" className="py-24 sm:py-32 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-background via-violet-950/[0.03] to-background" />

      <Container className="relative z-10">
        <ScrollReveal>
          <div className="text-center max-w-2xl mx-auto mb-14 sm:mb-16">
            <p className="text-sm font-semibold uppercase tracking-widest text-violet-400 mb-4">Showcase</p>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-white leading-tight">
              See it in action.
            </h2>
            <p className="mt-5 text-lg text-zinc-400 max-w-xl mx-auto">
              Beautiful profiles, powerful customization. This is what your page could look like.
            </p>
          </div>
        </ScrollReveal>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-6 items-stretch max-w-5xl mx-auto">
          <ScrollReveal className="lg:col-span-7 h-full" delay={100}>
            <SampleProfilePreview theme={{ ...t.config, layout: activeLayout }} showEditor={false} fill className="h-full" />
          </ScrollReveal>

          <ScrollReveal className="lg:col-span-5" delay={200}>
            <div className="flex h-full flex-col rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-5 sm:p-6">
              <p className="text-sm font-medium text-white mb-4">Theme Customization</p>
              <div className="grid grid-cols-4 gap-2.5">
                {themes.map((theme, i) => (
                  <button
                    key={theme.name}
                    onClick={() => setActiveTheme(i)}
                    className={`relative rounded-xl p-3 transition-all duration-200 cursor-pointer ${
                      activeTheme === i
                        ? "ring-2 ring-violet-500 ring-offset-2 ring-offset-zinc-950"
                        : "hover:ring-1 hover:ring-zinc-700 hover:ring-offset-1 hover:ring-offset-zinc-950"
                    }`}
                  >
                    <div
                      className="h-14 sm:h-16 rounded-lg mb-2.5 transition-transform duration-200"
                      style={{ backgroundColor: theme.config.accent ?? "#7c3aed" }}
                    />
                    <p className="text-xs font-medium text-white">{theme.name}</p>
                    {theme.tier !== "free" && (
                      <span className={`absolute top-1 right-1 rounded-full px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider ${theme.tier === "enterprise" ? "bg-amber-400/20 text-amber-300" : "bg-violet-400/20 text-violet-300"}`}>
                        {theme.tier === "enterprise" ? "ENT" : "PRO"}
                      </span>
                    )}
                  </button>
                ))}
              </div>
              <p className="mt-6 text-sm font-medium text-white mb-3">Layout</p>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {LAYOUT_META.map((l) => {
                  const Icon = l.icon;
                  const selected = activeLayout === l.id;
                  return (
                    <button
                      key={l.id}
                      onClick={() => setActiveLayout(l.id)}
                      className={`relative rounded-xl border p-2.5 text-left transition-all duration-200 cursor-pointer ${
                        selected
                          ? "border-violet-500 bg-violet-500/10 ring-1 ring-violet-500/30"
                          : "border-zinc-800 bg-zinc-900/40 hover:border-zinc-600"
                      }`}
                    >
                      <Icon
                        className={`h-4 w-4 mb-1.5 transition-colors ${selected ? "text-violet-400" : "text-zinc-400"}`}
                      />
                      <p className={`text-[11px] font-medium leading-tight ${selected ? "text-white" : "text-zinc-300"}`}>
                        {l.label}
                      </p>
                    </button>
                  );
                })}
              </div>
              {landingConfig?.featuredProfileUsername && (
                  <Link
                    to={`/${landingConfig.featuredProfileUsername}`}
                    className="mt-auto inline-flex items-center justify-center gap-2 h-11 px-4 text-sm rounded-lg font-medium border border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-white transition-all duration-200"
                  >
                    <Eye className="h-4 w-4" />
                    View <span className="truncate text-violet-400">/{landingConfig.featuredProfileUsername}</span>
                  </Link>
                )}
              <p className="mt-2 pt-6 text-center text-xs text-zinc-500">Powered by {branding.name}</p>
            </div>
          </ScrollReveal>
        </div>
      </Container>
    </section>
  );
}
