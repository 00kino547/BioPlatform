import { AlertTriangle, CheckCircle2, ExternalLink, RefreshCw, ShieldAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useUpdateLockdown } from "@/lib/useVersionCheck";
import type { UpdateSeverity } from "@/lib/api";

function SeverityChip({ severity }: { severity: UpdateSeverity }) {
  // All user-facing strings come from the `dashboard` namespace (updates.* keys).
  const { t } = useTranslation("dashboard");
  if (severity === "critical") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-500/15 text-red-300 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider">
        <ShieldAlert className="h-3 w-3" />
        {t("updates.severityCritical")}
      </span>
    );
  }
  if (severity === "security") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-orange-500/15 text-orange-300 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider">
        <ShieldAlert className="h-3 w-3" />
        {t("updates.severitySecurity")}
      </span>
    );
  }
  if (severity === "update") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-violet-500/15 text-violet-300 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider">
        {t("updates.severityUpdate")}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 text-emerald-300 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider">
      <CheckCircle2 className="h-3 w-3" />
      {t("updates.severityUpToDate")}
    </span>
  );
}

export function UpdateDialog({
  open,
  onClose,
  recheckable = false,
}: {
  open: boolean;
  onClose: () => void;
  recheckable?: boolean;
}) {
  // All user-facing strings come from the `dashboard` namespace (updates.* keys).
  const { t } = useTranslation("dashboard");
  const { data, loading, refresh } = useUpdateLockdown();

  return (
    <Dialog open={open} onClose={onClose} title={t("updates.dialogTitle")} maxWidth="max-w-2xl">
      <div className="space-y-4">
        {!data || data.error === "unknown" ? (
          <div className="text-center py-6 space-y-3">
            <p className="text-sm text-zinc-400">
              {loading ? t("updates.checking") : t("updates.checkFailed")}
            </p>
            {recheckable && (
              <Button onClick={() => refresh(true)} disabled={loading}>
                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                {t("updates.checkAgain")}
              </Button>
            )}
          </div>
        ) : data.error === "disabled" ? (
          <div className="text-center py-6 space-y-3">
            <p className="text-sm text-zinc-400">
              {t("updates.disabled", { version: data.installed })}
            </p>
          </div>
        ) : data.error && !data.outdated && data.severity === "none" ? (
          <div className="text-center py-6 space-y-3">
            <p className="text-sm text-zinc-400">{t("updates.checkFailed")}</p>
            {recheckable && (
              <Button onClick={() => refresh(true)} disabled={loading}>
                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                {t("updates.checkAgain")}
              </Button>
            )}
          </div>
        ) : data.outdated ? (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <SeverityChip severity={data.severity} />
              <p className="text-sm text-zinc-300">
                {t("updates.newerAvailable")} <span className="text-zinc-500">v{data.installed}</span>{" "}
                <span className="text-zinc-600">→</span>{" "}
                <span className="font-semibold text-white">v{data.latest}</span>
              </p>
            </div>
            {data.severity === "security" || data.severity === "critical" ? (
              <div className="flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3">
                <AlertTriangle className="h-4 w-4 text-red-400 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-red-300">
                  {t("updates.securityLocked")}
                  {data.skippedCount > 1 && t("updates.skippingVersions", { count: data.skippedCount })}
                </p>
              </div>
            ) : (
              data.skippedCount > 1 && (
                <p className="text-xs text-zinc-500">
                  {t("updates.includedVersions", { count: data.skippedCount })}
                </p>
              )
            )}

            <div className="max-h-72 overflow-y-auto space-y-4 pr-1">
              {data.skippedVersions.map((v) => (
                <div key={v.version} className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-3">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-sm font-semibold text-white">v{v.version}</span>
                    {v.date && <span className="text-xs text-zinc-500">{v.date}</span>}
                  </div>
                  {v.sections.length === 0 ? (
                    <p className="text-xs text-zinc-600">{t("updates.noDetails")}</p>
                  ) : (
                    v.sections.map((section, si) => (
                      <div key={si} className="mb-2 last:mb-0">
                        <p
                          className={`text-[11px] font-semibold uppercase tracking-wider mb-1 ${
                            /security|critical/i.test(section.heading)
                              ? "text-red-400"
                              : "text-zinc-400"
                          }`}
                        >
                          {section.heading}
                        </p>
                        <ul className="space-y-1">
                          {section.items.map((item, ii) => (
                            <li key={ii} className="text-xs text-zinc-400 leading-relaxed">
                              {item}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))
                  )}
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              {data.releaseUrl && (() => {
                try {
                  const u = new URL(data.releaseUrl);
                  if (!["http:", "https:"].includes(u.protocol)) return null;
                } catch {
                  return null;
                }
                return (
                  <Button href={data.releaseUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4" />
                    {t("updates.viewRelease")}
                  </Button>
                );
              })()}
              {recheckable && (
                <Button variant="secondary" onClick={() => refresh(true)} disabled={loading}>
                  <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                  {t("updates.recheck")}
                </Button>
              )}
            </div>
          </>
        ) : (
          <div className="text-center py-6 space-y-3">
            <CheckCircle2 className="h-10 w-10 text-emerald-400 mx-auto" />
            <div className="flex items-center justify-center gap-2">
              <SeverityChip severity="none" />
            </div>
            <p className="text-sm text-zinc-400">
              {t("updates.latest", { version: data.installed })}
            </p>
            {recheckable && (
              <Button variant="secondary" onClick={() => refresh(true)} disabled={loading}>
                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                {t("updates.checkAgain")}
              </Button>
            )}
          </div>
        )}
      </div>
    </Dialog>
  );
}
