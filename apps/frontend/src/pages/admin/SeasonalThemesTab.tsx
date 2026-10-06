import { useState } from "react";
import { Check } from "lucide-react";
import { FX_EFFECTS, type LayoutName } from "@/lib/api";
import { SampleProfilePreview } from "@/components/landing/SampleProfilePreview";
import { BackgroundSelector } from "@/components/ui/BackgroundSelector";
import { LayoutSelector } from "@/components/ui/LayoutSelector";

export interface SeasonalThemeConfig {
  bg?: string | null;
  cardBg?: string | null;
  text?: string | null;
  accent?: string | null;
  fontFamily?: string | null;
  layout?: string | null;
  backgroundImage?: string | null;
  effect?: string | null;
}

export interface SeasonalThemeAdmin {
  id: string;
  slug: string;
  label: string;
  emoji: string | null;
  kind: "season" | "holiday";
  enabled: boolean;
  config: SeasonalThemeConfig;
  startMonth: number | null;
  startDay: number | null;
  endMonth: number | null;
  endDay: number | null;
  overrideState: "on" | "off" | null;
  allowedByAdmin: boolean;
  sortOrder: number;
}

export interface SeasonalAdminConfig {
  enabled: boolean;
  autoSchedule: boolean;
  respectUserPreferences: boolean;
}

export interface SeasonalThemesData {
  themes: SeasonalThemeAdmin[];
  config: SeasonalAdminConfig;
  active: { theme: SeasonalThemeResolved | null; source: string };
}

export interface SeasonalThemeResolved {
  slug: string;
  label: string;
  emoji: string | null;
  kind: string;
  config: SeasonalThemeConfig;
}

export interface SeasonalThemesTabProps {
  data: SeasonalThemesData | null;
  error: string;
  saving: boolean;
  themeError: string;
  themeSaved: boolean;
  onSaveConfig: (config: SeasonalAdminConfig) => void;
  onUpdateTheme: (id: string, patch: Partial<SeasonalThemeAdmin>) => void;
  onUploadBackground?: (id: string, file: File) => Promise<boolean>;
  onRemoveBackground?: (id: string) => Promise<boolean>;
}

const KIND_LABELS: Record<string, string> = {
  season: "Season",
  holiday: "Holiday",
};

const OVERRIDE_LABELS: Record<string, string> = {
  on: "Forced on (manual override)",
  off: "Forced off",
  schedule: "Schedule",
};

export function SeasonalThemesTab({
  data,
  error,
  saving,
  themeError,
  themeSaved,
  onSaveConfig,
  onUpdateTheme,
  onUploadBackground,
  onRemoveBackground,
}: SeasonalThemesTabProps) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [bgUploading, setBgUploading] = useState<string | null>(null);

  if (error && !data) {
    return (
      <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-6 text-sm text-red-400">
        {error}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex justify-center py-16">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-700 border-t-violet-500" />
      </div>
    );
  }

  const { themes, config, active } = data;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/30 p-7 sm:p-8">
        <h2 className="text-lg font-semibold text-white mb-1">Seasonal Themes</h2>
        <p className="text-sm text-zinc-500 mb-5">
          Schedule seasonal and holiday themes that are applied to user profiles. A globally active theme
          overrides the user's custom appearance while it's live.
        </p>

        {themeError && (
          <p className="mb-4 text-sm text-red-400">{themeError}</p>
        )}
        {themeSaved && (
          <p className="mb-4 flex items-center gap-1.5 text-sm text-emerald-400">
            <Check className="h-4 w-4" /> Saved
          </p>
        )}

        <div className="grid gap-3 sm:grid-cols-3">
          <ToggleCard
            label="Seasonal themes"
            hint="Master switch for all seasonal features"
            checked={config.enabled}
            disabled={saving}
            onChange={(v) => onSaveConfig({ ...config, enabled: v })}
            accent="violet"
          />
          <ToggleCard
            label="Automatic scheduling"
            hint="Apply themes automatically within their date windows"
            checked={config.autoSchedule}
            disabled={saving || !config.enabled}
            onChange={(v) => onSaveConfig({ ...config, autoSchedule: v })}
            accent="blue"
          />
          <ToggleCard
            label="Respect user preference"
            hint="Let users disable seasonal decorations in Appearance"
            checked={config.respectUserPreferences}
            disabled={saving || !config.enabled}
            onChange={(v) => onSaveConfig({ ...config, respectUserPreferences: v })}
            accent="emerald"
          />
        </div>

        {active.theme && (
          <div className="mt-5 flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-3 text-sm">
            <span className="text-lg">{active.theme.emoji}</span>
            <span className="text-white font-medium">{active.theme.label}</span>
            <span className="rounded-full bg-violet-500/15 px-2.5 py-0.5 text-xs font-medium text-violet-300">
              {active.source}
            </span>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/30 p-7 sm:p-8">
        <h3 className="text-sm font-medium text-white mb-4">Themes</h3>
        <div className="space-y-3">
          {themes.map((theme) => (
            <div key={theme.id} className="overflow-hidden rounded-xl border border-zinc-800/70 bg-zinc-900/40">
              <div className="flex flex-wrap items-center gap-3 px-4 py-3">
                <span className="text-xl">{theme.emoji ?? "🎨"}</span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-white">
                    {theme.label}
                    <span className="ml-2 rounded-full border border-zinc-700 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                      {KIND_LABELS[theme.kind] ?? theme.kind}
                    </span>
                  </p>
                  <p className="text-xs text-zinc-500">
                    {theme.startMonth != null
                      ? `${MONTHS[theme.startMonth - 1]} ${theme.startDay} – ${MONTHS[(theme.endMonth ?? 1) - 1]} ${theme.endDay}`
                      : "No schedule window"}
                    {" · "}sort {theme.sortOrder}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    theme.overrideState === "on"
                      ? "bg-emerald-500/15 text-emerald-400"
                      : theme.overrideState === "off"
                      ? "bg-red-500/15 text-red-400"
                      : "bg-zinc-800 text-zinc-400"
                  }`}>
                    {OVERRIDE_LABELS[theme.overrideState ?? "schedule"]}
                  </span>
                  {theme.allowedByAdmin && (
                    <span className="rounded-full bg-violet-500/15 px-2.5 py-0.5 text-xs font-medium text-violet-300" title="Always allowed for users who opt in (e.g. Christmas)">
                      always-on
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => setExpanded(expanded === theme.id ? null : theme.id)}
                    className="rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-zinc-700 transition-colors"
                  >
                    {expanded === theme.id ? "Close" : "Edit"}
                  </button>
                </div>
              </div>

              {expanded === theme.id && (
                <div className="border-t border-zinc-800/70 px-4 py-4 space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block">
                      <span className="text-xs text-zinc-400">Label</span>
                      <input
                        value={theme.label}
                        onChange={(e) => onUpdateTheme(theme.id, { label: e.target.value })}
                        className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white focus:border-violet-500 focus:outline-none"
                      />
                    </label>
                    <label className="block">
                      <span className="text-xs text-zinc-400">Emoji</span>
                      <input
                        value={theme.emoji ?? ""}
                        onChange={(e) => onUpdateTheme(theme.id, { emoji: e.target.value || null })}
                        className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white focus:border-violet-500 focus:outline-none"
                      />
                    </label>
                    <label className="block">
                      <span className="text-xs text-zinc-400">Background color</span>
                      <input
                        type="color"
                        value={theme.config.bg?.startsWith("#") ? theme.config.bg! : "#09090b"}
                        onChange={(e) =>
                          onUpdateTheme(theme.id, { config: { ...theme.config, bg: e.target.value } })
                        }
                        className="mt-1 h-9 w-full rounded border border-zinc-700 bg-zinc-900 cursor-pointer"
                      />
                    </label>
                    <label className="block">
                      <span className="text-xs text-zinc-400">Card background</span>
                      <input
                        value={theme.config.cardBg ?? ""}
                        onChange={(e) =>
                          onUpdateTheme(theme.id, { config: { ...theme.config, cardBg: e.target.value } })
                        }
                        className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white focus:border-violet-500 focus:outline-none"
                      />
                    </label>
                    <label className="block">
                      <span className="text-xs text-zinc-400">Text color</span>
                      <input
                        type="color"
                        value={theme.config.text?.startsWith("#") ? theme.config.text! : "#e4e4e7"}
                        onChange={(e) =>
                          onUpdateTheme(theme.id, { config: { ...theme.config, text: e.target.value } })
                        }
                        className="mt-1 h-9 w-full rounded border border-zinc-700 bg-zinc-900 cursor-pointer"
                      />
                    </label>
                    <label className="block">
                      <span className="text-xs text-zinc-400">Accent color</span>
                      <input
                        type="color"
                        value={theme.config.accent?.startsWith("#") ? theme.config.accent! : "#7c3aed"}
                        onChange={(e) =>
                          onUpdateTheme(theme.id, { config: { ...theme.config, accent: e.target.value } })
                        }
                        className="mt-1 h-9 w-full rounded border border-zinc-700 bg-zinc-900 cursor-pointer"
                      />
                    </label>
                  </div>

                  <div>
                    <p className="text-xs text-zinc-400 mb-2">Animated background effect</p>
                    <div className="grid grid-cols-4 gap-2">
                      {FX_EFFECTS.map((e) => (
                        <button
                          key={e}
                          type="button"
                          onClick={() => onUpdateTheme(theme.id, { config: { ...theme.config, effect: e } })}
                          className={`rounded-lg px-3 py-2 text-xs font-medium capitalize transition-colors ${
                            (theme.config.effect ?? "none") === e
                              ? "bg-violet-500 text-white"
                              : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                          }`}
                        >
                          {e}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="text-xs text-zinc-400 mb-2">Background image</p>
                    <BackgroundSelector
                      value={theme.config.backgroundImage ?? null}
                      onChange={(v) => onUpdateTheme(theme.id, { config: { ...theme.config, backgroundImage: v } })}
                      onUpload={
                        onUploadBackground
                          ? async (file) => {
                              setBgUploading(theme.id);
                              try {
                                await onUploadBackground(theme.id, file);
                              } finally {
                                setBgUploading(null);
                              }
                            }
                          : undefined
                      }
                      onRemoveUpload={
                        onRemoveBackground
                          ? async () => {
                              setBgUploading(theme.id);
                              try {
                                await onRemoveBackground(theme.id);
                              } finally {
                                setBgUploading(null);
                              }
                            }
                          : undefined
                      }
                      uploading={bgUploading === theme.id}
                    />
                  </div>

                  <div>
                    <p className="text-xs text-zinc-400 mb-2">Layout</p>
                    <LayoutSelector
                      value={(theme.config.layout as LayoutName | null | undefined) ?? "default"}
                      onChange={(l) => onUpdateTheme(theme.id, { config: { ...theme.config, layout: l } })}
                    />
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <ToggleSwitch
                      label={theme.enabled ? "Enabled" : "Disabled"}
                      checked={theme.enabled}
                      onChange={(v) => onUpdateTheme(theme.id, { enabled: v })}
                    />
                    <ToggleSwitch
                      label={theme.allowedByAdmin ? "Always allow" : "Not always-on"}
                      checked={theme.allowedByAdmin}
                      onChange={(v) => onUpdateTheme(theme.id, { allowedByAdmin: v })}
                    />
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {(["schedule", "on", "off"] as const).map((state) => (
                      <button
                        key={state}
                        type="button"
                        onClick={() => onUpdateTheme(theme.id, { overrideState: state === "schedule" ? null : state })}
                        className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                          (theme.overrideState ?? "schedule") === state
                            ? "bg-violet-500 text-white"
                            : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                        }`}
                      >
                        {OVERRIDE_LABELS[state]}
                      </button>
                    ))}
                  </div>

                  <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-4">
                    <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-violet-300">Live preview</p>
                    <SampleProfilePreview theme={theme.config} badge={theme.label} showEditor={false} />
                  </div>
                </div>
              )}
            </div>
          ))}

          {themes.length === 0 && (
            <p className="text-sm text-zinc-500">No seasonal themes yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function ToggleCard({
  label,
  hint,
  checked,
  disabled,
  onChange,
  accent,
}: {
  label: string;
  hint: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
  accent: string;
}) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-white">{label}</p>
        <ToggleSwitch checked={checked} disabled={disabled} onChange={onChange} accent={accent} />
      </div>
      <p className="mt-1 text-xs text-zinc-500">{hint}</p>
    </div>
  );
}

function ToggleSwitch({
  label,
  checked,
  disabled,
  onChange,
  accent = "violet",
}: {
  label?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
  accent?: string;
}) {
  const onColors: Record<string, string> = {
    violet: "bg-violet-500",
    blue: "bg-blue-500",
    emerald: "bg-emerald-500",
  };
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!checked)}
      aria-pressed={checked}
      title={label}
      className={`inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
        checked ? onColors[accent] ?? "bg-violet-500" : "bg-zinc-700"
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
          checked ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
  );
}
