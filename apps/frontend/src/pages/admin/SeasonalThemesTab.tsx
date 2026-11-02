import { useState } from "react";
import { useTranslation } from "react-i18next";
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
  season: "admin.seasonalThemes.kindSeason",
  holiday: "admin.seasonalThemes.kindHoliday",
};

const OVERRIDE_LABELS: Record<string, string> = {
  on: "admin.seasonalThemes.overrideOn",
  off: "admin.seasonalThemes.overrideOff",
  schedule: "admin.seasonalThemes.overrideSchedule",
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
  // Admin tab for scheduling seasonal/holiday themes on user profiles.
  const { t } = useTranslation("admin");
  // Month labels live under admin.seasonalThemes.months.
  const monthName = (m: number) => t(`admin.seasonalThemes.months.${MONTH_KEYS[m - 1]}`);
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
        <h2 className="text-lg font-semibold text-white mb-1">{t("admin.seasonalThemes.title")}</h2>
        <p className="text-sm text-zinc-500 mb-5">
          {t("admin.seasonalThemes.description")}
        </p>

        {themeError && (
          <p className="mb-4 text-sm text-red-400">{themeError}</p>
        )}
        {themeSaved && (
          <p className="mb-4 flex items-center gap-1.5 text-sm text-emerald-400">
            <Check className="h-4 w-4" /> {t("admin.seasonalThemes.saved")}
          </p>
        )}

        <div className="grid gap-3 sm:grid-cols-3">
          <ToggleCard
            label={t("admin.seasonalThemes.toggleSeasonalThemes")}
            hint={t("admin.seasonalThemes.toggleSeasonalThemesHint")}
            checked={config.enabled}
            disabled={saving}
            onChange={(v) => onSaveConfig({ ...config, enabled: v })}
            accent="violet"
          />
          <ToggleCard
            label={t("admin.seasonalThemes.toggleAutoSchedule")}
            hint={t("admin.seasonalThemes.toggleAutoScheduleHint")}
            checked={config.autoSchedule}
            disabled={saving || !config.enabled}
            onChange={(v) => onSaveConfig({ ...config, autoSchedule: v })}
            accent="blue"
          />
          <ToggleCard
            label={t("admin.seasonalThemes.toggleRespectPreference")}
            hint={t("admin.seasonalThemes.toggleRespectPreferenceHint")}
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
        <h3 className="text-sm font-medium text-white mb-4">{t("admin.seasonalThemes.heading")}</h3>
        <div className="space-y-3">
          {themes.map((theme) => (
            <div key={theme.id} className="overflow-hidden rounded-xl border border-zinc-800/70 bg-zinc-900/40">
              <div className="flex flex-wrap items-center gap-3 px-4 py-3">
                <span className="text-xl">{theme.emoji ?? "🎨"}</span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-white">
                    {theme.label}
                    <span className="ml-2 rounded-full border border-zinc-700 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                      {KIND_LABELS[theme.kind] ? t(KIND_LABELS[theme.kind]) : theme.kind}
                    </span>
                  </p>
                  <p className="text-xs text-zinc-500">
                    {theme.startMonth != null
                      ? `${monthName(theme.startMonth)} ${theme.startDay} – ${monthName(theme.endMonth ?? 1)} ${theme.endDay}`
                      : t("admin.seasonalThemes.noScheduleWindow")}
                    {" "}{t("admin.seasonalThemes.sort", { order: theme.sortOrder })}
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
                    {t(OVERRIDE_LABELS[theme.overrideState ?? "schedule"])}
                  </span>
                  {theme.allowedByAdmin && (
                    <span className="rounded-full bg-violet-500/15 px-2.5 py-0.5 text-xs font-medium text-violet-300" title={t("admin.seasonalThemes.alwaysOnTitle")}>
                      {t("admin.seasonalThemes.alwaysOn")}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => setExpanded(expanded === theme.id ? null : theme.id)}
                    className="rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-zinc-700 transition-colors"
                  >
                    {expanded === theme.id ? t("admin.seasonalThemes.close") : t("admin.seasonalThemes.edit")}
                  </button>
                </div>
              </div>

              {expanded === theme.id && (
                <div className="border-t border-zinc-800/70 px-4 py-4 space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block">
                      <span className="text-xs text-zinc-400">{t("admin.seasonalThemes.label")}</span>
                      <input
                        value={theme.label}
                        onChange={(e) => onUpdateTheme(theme.id, { label: e.target.value })}
                        className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white focus:border-violet-500 focus:outline-none"
                      />
                    </label>
                    <label className="block">
                      <span className="text-xs text-zinc-400">{t("admin.seasonalThemes.emoji")}</span>
                      <input
                        value={theme.emoji ?? ""}
                        onChange={(e) => onUpdateTheme(theme.id, { emoji: e.target.value || null })}
                        className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white focus:border-violet-500 focus:outline-none"
                      />
                    </label>
                    <label className="block">
                      <span className="text-xs text-zinc-400">{t("admin.seasonalThemes.backgroundColor")}</span>
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
                      <span className="text-xs text-zinc-400">{t("admin.seasonalThemes.cardBackground")}</span>
                      <input
                        value={theme.config.cardBg ?? ""}
                        onChange={(e) =>
                          onUpdateTheme(theme.id, { config: { ...theme.config, cardBg: e.target.value } })
                        }
                        className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white focus:border-violet-500 focus:outline-none"
                      />
                    </label>
                    <label className="block">
                      <span className="text-xs text-zinc-400">{t("admin.seasonalThemes.textColor")}</span>
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
                      <span className="text-xs text-zinc-400">{t("admin.seasonalThemes.accentColor")}</span>
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
                    <p className="text-xs text-zinc-400 mb-2">{t("admin.seasonalThemes.effectLabel")}</p>
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
                    <p className="text-xs text-zinc-400 mb-2">{t("admin.seasonalThemes.backgroundImage")}</p>
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
                    <p className="text-xs text-zinc-400 mb-2">{t("admin.seasonalThemes.layout")}</p>
                    <LayoutSelector
                      value={(theme.config.layout as LayoutName | null | undefined) ?? "default"}
                      onChange={(l) => onUpdateTheme(theme.id, { config: { ...theme.config, layout: l } })}
                    />
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <ToggleSwitch
                      label={theme.enabled ? t("admin.seasonalThemes.enabled") : t("admin.seasonalThemes.disabled")}
                      checked={theme.enabled}
                      onChange={(v) => onUpdateTheme(theme.id, { enabled: v })}
                    />
                    <ToggleSwitch
                      label={theme.allowedByAdmin ? t("admin.seasonalThemes.alwaysAllow") : t("admin.seasonalThemes.notAlwaysOn")}
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
                        {t(OVERRIDE_LABELS[state])}
                      </button>
                    ))}
                  </div>

                  <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-4">
                    <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-violet-300">{t("admin.seasonalThemes.livePreview")}</p>
                    <SampleProfilePreview theme={theme.config} badge={theme.label} showEditor={false} />
                  </div>
                </div>
              )}
            </div>
          ))}

          {themes.length === 0 && (
            <p className="text-sm text-zinc-500">{t("admin.seasonalThemes.noThemes")}</p>
          )}
        </div>
      </div>
    </div>
  );
}

const MONTH_KEYS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"] as const;

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
