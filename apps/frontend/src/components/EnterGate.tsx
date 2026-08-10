import { useCallback, useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";

interface EnterGateProps {
  name: string;
  username: string;
  avatar?: string | null;
  accent: string;
  textColor: string;
  onEnter?: () => void;
}

export function EnterGate({ name, username, avatar, accent, textColor, onEnter }: EnterGateProps) {
  const [entered, setEntered] = useState(false);
  const [gone, setGone] = useState(false);

  const enter = useCallback(() => {
    if (entered) return;
    setEntered(true);
    onEnter?.();
    window.setTimeout(() => setGone(true), 800);
  }, [entered, onEnter]);

  useEffect(() => {
    window.addEventListener("keydown", enter);
    return () => window.removeEventListener("keydown", enter);
  }, [enter]);

  if (gone) return null;

  return (
    <div
      className={`fixed inset-0 z-[70] flex flex-col items-center justify-center text-center px-6 transition-all duration-700 ${
        entered ? "opacity-0 scale-[1.04] pointer-events-none" : "opacity-100"
      }`}
      style={{
        backgroundColor: "rgba(3,3,6,0.55)",
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
      }}
    >
      <div className="relative mb-6">
        <div
          className="absolute -inset-4 rounded-full animate-pulse"
          style={{ background: `radial-gradient(circle, ${accent}55, transparent 70%)` }}
        />
        {avatar ? (
          <img
            src={avatar}
            alt={name}
            className="relative h-20 w-20 sm:h-24 sm:w-24 rounded-full object-cover ring-4 ring-white/10"
          />
        ) : (
          <div
            className="relative h-20 w-20 sm:h-24 sm:w-24 rounded-full flex items-center justify-center text-3xl font-black text-white"
            style={{ backgroundColor: accent }}
          >
            {name.charAt(0).toUpperCase()}
          </div>
        )}
      </div>

      <h1 className="text-4xl sm:text-5xl font-black tracking-tight text-white">{name}</h1>
      <p className="mt-2 text-sm font-medium tracking-wide" style={{ color: `${textColor}aa` }}>
        @{username}
      </p>

      <button
        onClick={enter}
        className="group mt-10 inline-flex items-center gap-3 rounded-full px-8 py-3.5 text-base font-bold text-white transition-all duration-300 hover:scale-105 active:scale-95 cursor-pointer"
        style={{ backgroundColor: accent, boxShadow: `0 0 40px -8px ${accent}aa` }}
      >
        Press to enter
        <ArrowRight className="h-5 w-5 transition-transform duration-300 group-hover:translate-x-1" />
      </button>

      <p className="mt-4 text-xs" style={{ color: `${textColor}66` }}>
        or press any key
      </p>
    </div>
  );
}
