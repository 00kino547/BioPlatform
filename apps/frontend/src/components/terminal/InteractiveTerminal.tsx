import { useEffect, useMemo, useRef, useState } from "react";
import { runCommand, HINT_TEXT, type TerminalLine, type TerminalLink, type TerminalCommand } from "./commands";

interface InteractiveTerminalProps {
  username: string;
  displayName: string | null;
  bio: string | null;
  website: string | null;
  brand: string;
  accent: string;
  text: string;
  links: TerminalLink[];
  terminalCommands?: TerminalCommand[];
  className?: string;
  maxHeight?: string;
  noPadding?: boolean;
}

function MatrixRain({ accent, onDone }: { accent: string; onDone: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const chars = "アィウェオカキクケコサシスセソタチツテトナニヌネノ0123456789ABCDEF$#";
    const fontSize = 14;

    const size = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };
    size();
    window.addEventListener("resize", size);

    const drops: number[] = [];
    const init = () => {
      const cols = Math.max(1, Math.floor(canvas.width / fontSize));
      drops.length = 0;
      for (let i = 0; i < cols; i++) drops.push(Math.round(Math.random() * -20));
    };
    init();

    ctx.fillStyle = "#05070a";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    let raf = 0;
    const draw = () => {
      const cols = Math.max(1, Math.floor(canvas.width / fontSize));
      ctx.fillStyle = "rgba(5,7,10,0.08)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.font = `bold ${fontSize}px "JetBrains Mono", ui-monospace, monospace`;
      for (let i = 0; i < cols; i++) {
        const ch = chars[Math.floor(Math.random() * chars.length)];
        const y = drops[i] * fontSize;
        ctx.fillStyle = accent;
        ctx.globalAlpha = i % 3 === 0 ? 0.5 : 1;
        ctx.fillText(ch, i * fontSize, y);
        ctx.globalAlpha = 1;
        if (y > canvas.height && Math.random() > 0.96) drops[i] = 0;
        drops[i] += 1;
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    const timer = window.setTimeout(() => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", size);
      doneRef.current();
    }, 10000);

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(timer);
      window.removeEventListener("resize", size);
    };
  }, [accent]);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      data-testid="matrix-rain"
      className="absolute inset-0 z-10 h-full w-full"
    />
  );
}

export function InteractiveTerminal({
  username,
  displayName,
  bio,
  website,
  brand,
  accent,
  text,
  links,
  terminalCommands = [],
  className = "",
  maxHeight = "min(420px, 60vh)",
  noPadding = false,
}: InteractiveTerminalProps) {
  const [lines, setLines] = useState<TerminalLine[]>([{ text: HINT_TEXT, kind: "dim" }]);
  const [value, setValue] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const [matrixRain, setMatrixRain] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const host = useMemo(
    () => (typeof window !== "undefined" ? window.location.hostname || "localhost" : "localhost"),
    [],
  );

  const focus = () => inputRef.current?.focus();

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines, matrixRain]);

  useEffect(() => {
    focus();
  }, []);

  const submit = (raw: string) => {
    if (!raw) return;
    const promptLine: TerminalLine = { text: `$ ${raw}`, kind: "accent" };
    const res = runCommand(raw, { username, displayName, bio, website, brand, host, links, terminalCommands });

    setHistory((h) => [...h, raw]);
    setHistoryIdx(-1);
    setValue("");

    if (res.clear) {
      setLines([{ text: HINT_TEXT, kind: "dim" }]);
      focus();
      return;
    }
    setLines((prev) => [...prev, promptLine, ...res.output]);
    focus();

    if (res.matrixRain) setMatrixRain(true);

    if (res.open) {
      if (res.open.copy) {
        void navigator.clipboard?.writeText(res.open.url);
      } else if (/^mailto:/i.test(res.open.url)) {
        window.location.href = res.open.url;
      } else {
        window.open(res.open.url, "_blank", "noopener,noreferrer");
      }
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (history.length === 0) return;
      const idx = historyIdx === -1 ? history.length - 1 : Math.max(0, historyIdx - 1);
      setHistoryIdx(idx);
      setValue(history[idx]);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (historyIdx === -1) return;
      const idx = historyIdx + 1;
      if (idx >= history.length) {
        setHistoryIdx(-1);
        setValue("");
      } else {
        setHistoryIdx(idx);
        setValue(history[idx]);
      }
    }
  };

  const openUrl = (url: string) => {
    if (/^mailto:/i.test(url)) window.location.href = url;
    else window.open(url, "_blank", "noopener,noreferrer");
  };

  const lineColor = (line: TerminalLine) =>
    line.kind === "accent" ? accent : line.kind === "dim" ? `${text}88` : text;

  return (
    <div
      className={`relative overflow-hidden ${className}`}
      style={{ maxHeight }}
      onClick={focus}
      data-testid="terminal"
    >
      {matrixRain && (
        <MatrixRain accent={accent} onDone={() => setMatrixRain(false)} />
      )}
      <div
        ref={scrollRef}
        className={`scrollbar-thin h-full max-h-[inherit] space-y-1.5 overflow-y-auto ${noPadding ? "" : "px-4 pb-3 sm:px-6"}`}
      >
        {lines.map((line, i) =>
          line.url ? (
            <button
              key={i}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                openUrl(line.url!);
              }}
              className="block max-w-full truncate text-left text-xs hover:underline"
              style={{ color: lineColor(line) }}
            >
              {line.text}
            </button>
          ) : (
            <div key={i} className="text-xs" style={{ color: lineColor(line) }}>
              {line.text}
            </div>
          ),
        )}
        <form onSubmit={(e) => (e.preventDefault(), submit(value))} className="flex items-center gap-2">
          <span className="text-sm font-semibold" style={{ color: accent }}>
            $
          </span>
          <input
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={onKeyDown}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            aria-label="Terminal input"
            data-testid="terminal-input"
            className="flex-1 bg-transparent text-sm font-semibold outline-none"
            style={{ color: text, caretColor: accent }}
          />
          <span
            className="inline-block h-4 w-2 animate-pulse"
            style={{ backgroundColor: accent, display: value ? "none" : "inline-block" }}
          />
        </form>
      </div>
    </div>
  );
}