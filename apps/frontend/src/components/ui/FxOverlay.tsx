import { useEffect, useRef } from "react";

export type FxEffect =
  | "none"
  | "snow"
  | "pumpkins"
  | "hearts"
  | "leaves"
  | "stars"
  | "confetti"
  | "sparkle";

interface FxOverlayProps {
  effect?: FxEffect | null;
  className?: string;
  accent?: string;
  density?: "low" | "normal";
}

interface Particle {
  x: number;
  y: number;
  size: number;
  speed: number;
  drift: number;
  phase: number;
  char?: string;
  color?: string;
  rot: number;
  rotSpeed: number;
  twinkle?: boolean;
}

interface FxDef {
  count: number;
  chars?: string[];
  colors: string[];
  sizeMin: number;
  sizeMax: number;
  speedMin: number;
  speedMax: number;
  driftMax: number;
  round?: boolean;
  twinkle?: boolean;
}

const DEFS: Record<Exclude<FxEffect, "none">, FxDef> = {
  snow: {
    count: 60, colors: ["#ffffff"], sizeMin: 2, sizeMax: 5,
    speedMin: 0.35, speedMax: 1.2, driftMax: 0.4, round: true,
  },
  pumpkins: {
    count: 14, chars: ["🎃"], colors: [], sizeMin: 22, sizeMax: 40,
    speedMin: 0.6, speedMax: 1.6, driftMax: 0.6,
  },
  hearts: {
    count: 22, chars: ["💖", "❤️", "💕"], colors: [], sizeMin: 16, sizeMax: 30,
    speedMin: 0.5, speedMax: 1.5, driftMax: 0.8,
  },
  leaves: {
    count: 24, chars: ["🍂", "🍁", "🍃"], colors: [], sizeMin: 16, sizeMax: 28,
    speedMin: 0.5, speedMax: 1.4, driftMax: 1.0,
  },
  stars: {
    count: 30, chars: ["✦", "✧", "✶"], colors: ["#ffe9a8", "#ffd75e", "#fff6d6"], sizeMin: 12, sizeMax: 22,
    speedMin: 0.4, speedMax: 1.2, driftMax: 0.5, twinkle: true,
  },
  confetti: {
    count: 60, colors: ["#f43f5e", "#f59e0b", "#10b981", "#3b82f6", "#a855f7", "#ec4899"], sizeMin: 4, sizeMax: 8,
    speedMin: 1.0, speedMax: 2.2, driftMax: 0.9,
  },
  sparkle: {
    count: 40, chars: ["✦", "✦"], colors: ["#ffffff", "#ffe9a8", "#d4f1ff"], sizeMin: 8, sizeMax: 16,
    speedMin: 0.1, speedMax: 0.5, driftMax: 0.3, twinkle: true,
  },
};

function makeParticles(def: FxDef, w: number, h: number, accent: string): Particle[] {
  const reduce = def.count;
  const base = Math.max(0, w * h) / (120000 * (reduce / 40));
  let count = Math.round(base);
  count = Math.max(6, Math.min(reduce, count));
  const parts: Particle[] = [];
  for (let i = 0; i < count; i++) {
    const char = def.chars?.[Math.floor(Math.random() * def.chars.length)];
    parts.push({
      x: Math.random() * w,
      y: (Math.random() * h) - (def.chars ? h * 0.2 : 0),
      size: def.sizeMin + Math.random() * (def.sizeMax - def.sizeMin),
      speed: def.speedMin + Math.random() * (def.speedMax - def.speedMin),
      drift: Math.random() * def.driftMax,
      phase: Math.random() * Math.PI * 2,
      char,
      color: def.colors.length ? def.colors[Math.floor(Math.random() * def.colors.length)] : accent,
      rot: Math.random() * Math.PI * 2,
      rotSpeed: (Math.random() - 0.5) * 0.02,
      twinkle: def.twinkle,
    });
  }
  return parts;
}

export function FxOverlay({ effect = "none", className = "", accent = "#ffffff", density = "normal" }: FxOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!effect || effect === "none") return;
    const def = DEFS[effect];
    if (!def) return;

    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let width = 0;
    let height = 0;
    let parts: Particle[] = [];
    let stopped = false;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      parts = makeParticles(
        density === "low" ? { ...def, count: Math.round(def.count * 0.5) } : def,
        width,
        height,
        accent
      );
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    let last = performance.now();
    const loop = (now: number) => {
      if (stopped) return;
      const dt = Math.min(now - last, 50) / 16;
      last = now;
      ctx.clearRect(0, 0, width, height);
      for (const p of parts) {
        p.phase += 0.01 * dt;
        p.y += p.speed * dt;
        p.x += Math.sin(p.phase * 2) * p.drift * dt;
        p.rot += p.rotSpeed * dt;

        if (p.y - p.size > height) {
          p.y = -p.size;
          p.x = Math.random() * width;
        }
        if (p.x - p.size > width) p.x = -p.size;
        if (p.x + p.size < 0) p.x = width + p.size;

        const alpha = p.twinkle ? 0.55 + 0.45 * Math.sin(p.phase * 3) : 1;

        if (def.round || (!p.char && (!def.chars || def.chars.length === 0))) {
          ctx.globalAlpha = alpha * 0.85;
          ctx.fillStyle = p.color ?? accent;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size / 2, 0, Math.PI * 2);
          ctx.fill();
        } else if (p.char) {
          ctx.globalAlpha = alpha;
          ctx.font = `${p.size}px serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillStyle = p.color ?? accent;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillText(p.char, 0, 0);
          ctx.restore();
        } else {
          // small colored rectangles (confetti)
          ctx.globalAlpha = alpha;
          ctx.fillStyle = p.color ?? accent;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
          ctx.restore();
        }
      }
      rafRef.current = requestAnimationFrame(loop);
    };

    const handleVisibility = () => {
      if (document.hidden) {
        stopped = true;
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
      } else if (!stopped) {
        stopped = false;
        last = performance.now();
        rafRef.current = requestAnimationFrame(loop);
      } else {
        stopped = false;
        rafRef.current = requestAnimationFrame(loop);
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      stopped = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      ro.disconnect();
      document.removeEventListener("visibilitychange", handleVisibility);
      ctx.clearRect(0, 0, width, height);
    };
  }, [effect, accent, density]);

  if (!effect || effect === "none") return null;

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 z-[1] h-full w-full ${className}`}
    />
  );
}
