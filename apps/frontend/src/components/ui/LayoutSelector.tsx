import { LayoutGrid, LayoutList, Rows3, PanelLeft, AlignCenter, Sparkles, Minimize2, Columns3, GalleryVerticalEnd, SquareDashedBottom, SquareTerminal, Camera, PanelTop } from "lucide-react";
import type { LayoutName } from "@/lib/api";

export const LAYOUT_META: { id: LayoutName; label: string; hint: string; icon: typeof LayoutGrid }[] = [
  { id: "default", label: "Default", hint: "Simple centered card", icon: LayoutGrid },
  { id: "grid", label: "Grid", hint: "2-column icon tiles", icon: Columns3 },
  { id: "compact", label: "Compact", hint: "Tight single-column", icon: Minimize2 },
  { id: "wide", label: "Wide", hint: "Full-width 3 columns", icon: Rows3 },
  { id: "glassmorphism", label: "Glass", hint: "Frosted glass card", icon: Sparkles },
  { id: "minimal", label: "Minimal", hint: "Clean, borderless", icon: AlignCenter },
  { id: "sidebar", label: "Sidebar", hint: "Avatar beside content", icon: PanelLeft },
  { id: "editorial", label: "Editorial", hint: "Masthead + hairlines", icon: LayoutList },
  { id: "hero", label: "Hero", hint: "Big centered hero", icon: GalleryVerticalEnd },
  { id: "bento", label: "Bento", hint: "Mixed-size tiles", icon: SquareDashedBottom },
  { id: "terminal", label: "Terminal", hint: "Hacker monospace card", icon: SquareTerminal },
  { id: "polaroid", label: "Polaroid", hint: "Tilted photo frame", icon: Camera },
  { id: "topbar", label: "Topbar", hint: "Horizontal nav header", icon: PanelTop },
];

interface LayoutSelectorProps {
  value: LayoutName | null | undefined;
  onChange: (layout: LayoutName | null) => void;
}

export function LayoutSelector({ value, onChange }: LayoutSelectorProps) {
  const current = value ?? "default";
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {LAYOUT_META.map((l) => {
        const Icon = l.icon;
        const selected = current === l.id;
        return (
          <button
            key={l.id}
            type="button"
            onClick={() => onChange(l.id)}
            className={`rounded-xl border p-3 text-left transition-all ${
              selected
                ? "border-violet-500 bg-violet-500/10 ring-1 ring-violet-500/30"
                : "border-zinc-800 bg-zinc-900/40 hover:border-zinc-600"
            }`}
          >
            <Icon className={`h-5 w-5 mb-2 transition-colors ${selected ? "text-violet-400" : "text-zinc-400"}`} />
            <p className={`text-xs font-medium ${selected ? "text-white" : "text-zinc-300"}`}>{l.label}</p>
            <p className="text-[10px] text-zinc-500 mt-0.5">{l.hint}</p>
          </button>
        );
      })}
    </div>
  );
}
