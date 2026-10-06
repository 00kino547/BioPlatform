import { useEffect, useMemo, useState } from "react";
import { Timer } from "lucide-react";

function diff(target: number, now: number) {
  const ms = Math.max(0, target - now);
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return { d, h, m, sec, done: ms === 0 };
}

export function CountdownBanner({ label, targetDate, accent }: { label?: string; targetDate: string; accent: string }) {
  const target = useMemo(() => {
    const parsed = new Date(targetDate);
    return Number.isNaN(parsed.getTime()) ? null : parsed.getTime();
  }, [targetDate]);

  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const { d, h, m, sec, done } = target ? diff(target, now) : { d: 0, h: 0, m: 0, sec: 0, done: true };

  const cell = (value: number, unit: string) => (
    <div className="flex flex-col items-center rounded-lg px-2.5 py-1.5 min-w-[3.5rem]"
      style={{ backgroundColor: `${accent}12`, border: `1px solid ${accent}26` }}
    >
      <span className="text-lg font-bold tabular-nums leading-none" style={{ color: accent }}>
        {String(value).padStart(2, "0")}
      </span>
      <span className="mt-1 text-[9px] uppercase tracking-widest opacity-70 leading-none">{unit}</span>
    </div>
  );

  return (
    <div
      className="mb-4 rounded-xl px-4 py-3 w-full"
      style={{ backgroundColor: `${accent}0a`, border: `1px solid ${accent}22` }}
    >
      {label && (
        <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest" style={{ color: accent }}>
          <Timer className="h-3.5 w-3.5" />
          {label}
        </p>
      )}
      {!target || done ? (
        <p className="text-sm opacity-80">Done</p>
      ) : (
        <div className="flex flex-wrap items-center gap-2 justify-center sm:justify-start">
          {cell(d, "days")}
          {cell(h, "hrs")}
          {cell(m, "min")}
          {cell(sec, "sec")}
        </div>
      )}
    </div>
  );
}