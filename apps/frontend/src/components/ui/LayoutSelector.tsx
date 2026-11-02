import type { LayoutName } from "@/lib/api";
import { useTranslation } from "react-i18next";
import { LAYOUT_META } from "./layoutMeta";

// Layout catalogue consumed outside this component (e.g. the landing showcase).
// Labels/hints stay the English defaults; LayoutSelector below overlays the
// translated values from the `common` namespace keyed by layout id.
interface LayoutSelectorProps {
  value: LayoutName | null | undefined;
  onChange: (layout: LayoutName | null) => void;
}

export function LayoutSelector({ value, onChange }: LayoutSelectorProps) {
  const { t } = useTranslation("common");
  // Overlay translated label/hint on the shared catalogue, keyed by layout id.
  const meta = LAYOUT_META.map((l) => ({
    ...l,
    label: t(`layoutSelector.${l.id}.label`),
    hint: t(`layoutSelector.${l.id}.hint`),
  }));
  const current = value ?? "default";
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {meta.map((l) => {
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
