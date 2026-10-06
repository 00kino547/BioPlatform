import { useRef, useState } from "react";
import { Upload, Trash2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export const BACKGROUND_PRESETS_DEF = [
  { id: "none", label: "None", value: "" },
  { id: "midnight", label: "Midnight", value: "linear-gradient(135deg, #09090b 0%, #18181b 50%, #27272a 100%)" },
  { id: "ocean", label: "Ocean", value: "linear-gradient(135deg, #0c1222 0%, #164e63 50%, #0ea5e9 100%)" },
  { id: "sunset", label: "Sunset", value: "linear-gradient(135deg, #1a0a0a 0%, #7c2d12 45%, #f97316 100%)" },
  { id: "forest", label: "Forest", value: "linear-gradient(135deg, #0a1a0f 0%, #14532d 50%, #22c55e 100%)" },
  { id: "aurora", label: "Aurora", value: "linear-gradient(135deg, #071426 0%, #155e75 45%, #a5f3fc 100%)" },
  { id: "royal", label: "Royal", value: "linear-gradient(135deg, #0b0712 0%, #5b21b6 50%, #a78bfa 100%)" },
  { id: "mint", label: "Mint", value: "linear-gradient(135deg, #022c22 0%, #065f46 50%, #6ee7b7 100%)" },
  { id: "candy", label: "Candy", value: "linear-gradient(135deg, #2e1065 0%, #9d174d 45%, #f9a8d4 100%)" },
  { id: "ember", label: "Ember", value: "linear-gradient(135deg, #1c1917 0%, #7c2d12 50%, #fb923c 100%)" },
  { id: "ice", label: "Ice", value: "linear-gradient(135deg, #0f172a 0%, #334155 50%, #e0f2fe 100%)" },
] as const;

export const SEASONAL_BACKGROUND_PRESETS = [
  { id: "spring-blossom", label: "Spring Blossom", value: "linear-gradient(135deg, #fdf2f8 0%, #f9a8d4 40%, #e879f9 100%)" },
  { id: "autumn-leaves", label: "Autumn Leaves", value: "linear-gradient(135deg, #431407 0%, #b45309 50%, #f59e0b 100%)" },
  { id: "winter-snow", label: "Winter Snow", value: "linear-gradient(135deg, #0f172a 0%, #475569 55%, #e2e8f0 100%)" },
  { id: "halloween", label: "Halloween", value: "linear-gradient(135deg, #000000 0%, #3b0764 45%, #ea580c 100%)" },
  { id: "christmas", label: "Christmas", value: "linear-gradient(135deg, #052e16 0%, #166534 50%, #dc2626 100%)" },
  { id: "ny-eve", label: "New Year", value: "linear-gradient(135deg, #020617 0%, #1e3a8a 45%, #facc15 100%)" },
  { id: "valentine", label: "Valentine", value: "linear-gradient(135deg, #4c0519 0%, #be123c 50%, #fda4af 100%)" },
  { id: "stpatrick", label: "St. Patrick", value: "linear-gradient(135deg, #052e16 0%, #16a34a 55%, #bef264 100%)" },
] as const;

interface BackgroundSelectorProps {
  value: string | null | undefined;
  onChange: (value: string | null) => void;
  onUpload?: (file: File) => Promise<void>;
  onRemoveUpload?: () => Promise<void>;
  uploading?: boolean;
  seasonal?: boolean;
  disabled?: boolean;
  className?: string;
}

export function BackgroundSelector({
  value,
  onChange,
  onUpload,
  onRemoveUpload,
  uploading = false,
  seasonal = false,
  disabled = false,
  className,
}: BackgroundSelectorProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const applied = value ?? "";
  const isCustom = applied && !BACKGROUND_PRESETS_DEF.some((p) => p.value === applied) &&
    !SEASONAL_BACKGROUND_PRESETS.some((p) => p.value === applied);

  const pickPreset = (v: string) => onChange(v || null);

  const handleFile = async (file: File | null) => {
    if (!file || !onUpload) return;
    setBusy(true);
    try {
      setValueBusy(file.name);
      await onUpload(file);
    } finally {
      setBusy(false);
      setValueBusy(null);
    }
  };

  const [customUrl, setCustomUrl] = useState(isCustom ? applied : "");
  const [valueBusy, setValueBusy] = useState<string | null>(null);

  return (
    <div className={cn("space-y-4", className)}>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {BACKGROUND_PRESETS_DEF.map((p) => {
          const selected = applied === p.value;
          return (
            <button
              key={p.id}
              type="button"
              disabled={disabled || uploading}
              onClick={() => pickPreset(p.value)}
              className={cn(
                "group relative aspect-video overflow-hidden rounded-lg border transition-all",
                selected ? "border-violet-500 ring-2 ring-violet-500/40" : "border-zinc-800 hover:border-zinc-600"
              )}
              style={p.value ? { background: p.value } : { backgroundColor: "#18181b" }}
              aria-label={p.label}
            >
              {!p.value && (
                <span className="absolute inset-0 flex items-center justify-center text-[10px] text-zinc-500">
                  None
                </span>
              )}
              {selected && (
                <span className="absolute top-1 right-1 h-3 w-3 rounded-full bg-violet-500 ring-2 ring-white/30" />
              )}
              <span className="absolute bottom-1 left-1.5 right-1.5 truncate rounded bg-black/40 px-1 py-0.5 text-[9px] text-white/90 backdrop-blur-sm">
                {p.label}
              </span>
            </button>
          );
        })}
      </div>

      {seasonal && (
        <div>
          <p className="mb-2 text-xs text-zinc-400">Seasonal & Holiday</p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {SEASONAL_BACKGROUND_PRESETS.map((p) => {
              const selected = applied === p.value;
              return (
                <button
                  key={p.id}
                  type="button"
                  disabled={disabled || uploading}
                  onClick={() => pickPreset(p.value)}
                  className={cn(
                    "group relative aspect-video overflow-hidden rounded-lg border transition-all",
                    selected ? "border-violet-500 ring-2 ring-violet-500/40" : "border-zinc-800 hover:border-zinc-600"
                  )}
                  style={{ background: p.value }}
                  aria-label={p.label}
                >
                  {selected && (
                    <span className="absolute top-1 right-1 h-3 w-3 rounded-full bg-violet-500 ring-2 ring-white/30" />
                  )}
                  <span className="absolute bottom-1 left-1.5 right-1.5 truncate rounded bg-black/40 px-1 py-0.5 text-[9px] text-white/90 backdrop-blur-sm">
                    {p.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {onUpload && (
        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={fileRef}
            type="file"
            accept="image/*,.gif,.webp"
            className="hidden"
            onChange={(e) => {
              handleFile(e.target.files?.[0] ?? null);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            disabled={disabled || uploading || busy}
            onClick={() => fileRef.current?.click()}
            className={cn(
              "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition-colors",
              "bg-zinc-800 text-zinc-200 hover:bg-zinc-700 disabled:opacity-40"
            )}
          >
            {uploading || busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Upload className="h-3.5 w-3.5" />
            )}
            {valueBusy ? `Uploading ${valueBusy}…` : "Upload image / GIF"}
          </button>
          {isCustom && onRemoveUpload && (
            <button
              type="button"
              disabled={disabled}
              onClick={() => {
                setCustomUrl("");
                onChange(null);
                void onRemoveUpload();
              }}
              className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-red-400 hover:bg-red-500/10 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Remove custom
            </button>
          )}
        </div>
      )}

      <label className="block">
        <span className="text-xs text-zinc-400">Custom URL</span>
        <input
          type="url"
          value={customUrl}
          disabled={disabled}
          onChange={(e) => {
            setCustomUrl(e.target.value);
            onChange(e.target.value || null);
          }}
          placeholder="https://… or /uploads/…"
          className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-violet-500 focus:outline-none disabled:opacity-40"
        />
      </label>
    </div>
  );
}
