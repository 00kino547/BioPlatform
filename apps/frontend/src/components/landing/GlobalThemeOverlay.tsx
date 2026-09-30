import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { FxOverlay } from "@/components/ui/FxOverlay";
import { toBackgroundImage } from "@/lib/media";

interface ActiveThemeConfig {
  bg?: string | null;
  cardBg?: string | null;
  text?: string | null;
  accent?: string | null;
  fontFamily?: string | null;
  layout?: string | null;
  backgroundImage?: string | null;
  effect?: string | null;
}

// Palettes the landing page actually consumes. Everything is intentionally a
// `var(--seasonal-*)` (or an overridable Tailwind ramp) that reacts to the
// active seasonal theme and degrades to the declared default when none is set.
export function GlobalThemeOverlay() {
  const [config, setConfig] = useState<ActiveThemeConfig | null>(null);
  const [ready, setReady] = useState(false);
  const applied = useRef<{ prop: string; value: string }[]>([]);

  useEffect(() => {
    let alive = true;
    api
      .getActiveSeasonalTheme()
      .then((res) => {
        if (!alive) return;
        if (!res.success) return;
        setConfig(res.data?.theme?.config ?? null);
      })
      .catch(() => {})
      .finally(() => alive && setReady(true));
    return () => {
      alive = false;
    };
  }, []);

  // Map the active theme onto CSS custom properties so the entire landing page
  // (nav, hero, sections, accents) follows the seasonal palette proportionally.
  // When no theme (or a partial one) is active the properties are removed so
  // the stylesheet defaults shine through — graceful degradation.
  useEffect(() => {
    const root = document.documentElement;

    const clear = () => {
      for (const { prop } of applied.current) root.style.removeProperty(prop);
      applied.current = [];
    };

    if (!config) {
      clear();
      return;
    }

    clear();
    const next: { prop: string; value: string }[] = [];
    const set = (prop: string, value: string | null | undefined) => {
      if (value) next.push({ prop, value });
    };

    // Semantic Tailwind ramps follow the accent when the theme defines one,
    // making violet/cyan utilities (CTAs, glows, eyebrows, gradients) themed.
    const accent = config.accent ?? null;
    set("--color-primary", accent);
    set("--color-ring", accent);
    set("--color-violet-300", accent);
    set("--color-violet-400", accent);
    set("--color-violet-500", accent);
    set("--color-violet-600", accent);
    set("--color-violet-700", accent);
    set("--color-violet-950", accent);
    set("--color-cyan-400", accent);
    set("--color-cyan-500", accent);
    set("--color-cyan-600", accent);

    // Body + section backgrounds (bg-background / from-background / navbar tint).
    set("--color-background", config.bg ?? null);
    set("--color-foreground", config.text ?? null);
    set("--font-sans", config.fontFamily ?? null);

    // Named seasonal tokens for components that need finer control (cards).
    set("--seasonal-bg", config.bg ?? null);
    set("--seasonal-card-bg", config.cardBg ?? null);
    set("--seasonal-text", config.text ?? null);
    set("--seasonal-accent", config.accent ?? null);
    set("--seasonal-font", config.fontFamily ?? null);

    for (const { prop, value } of next) root.style.setProperty(prop, value);
    applied.current = next;

    return clear;
  }, [config]);

  if (!ready) return null;

  const effect = config?.effect ?? null;
  const backgroundImage = config?.backgroundImage ?? null;
  // The overlay only needs to render for FX / background image layers; plain
  // color themes are already applied via the CSS custom properties above.
  if (!effect || effect === "none") {
    if (!backgroundImage) return null;
  }

  return (
    <div
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
      aria-hidden="true"
      style={
        backgroundImage
          ? {
              backgroundImage: toBackgroundImage(backgroundImage),
              backgroundSize: "cover",
              backgroundPosition: "center",
              backgroundAttachment: "fixed",
              backgroundColor: config?.bg ?? "transparent",
            }
          : { backgroundColor: config?.bg ?? "transparent" }
      }
    >
      {effect && effect !== "none" && (
        <FxOverlay effect={effect as Parameters<typeof FxOverlay>[0]["effect"]} accent={config?.accent ?? "#ffffff"} />
      )}
    </div>
  );
}