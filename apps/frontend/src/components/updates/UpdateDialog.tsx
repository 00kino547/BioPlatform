import { AlertTriangle, CheckCircle2, ExternalLink, RefreshCw, ShieldAlert } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useUpdateLockdown } from "@/lib/useVersionCheck";
import type { UpdateSeverity } from "@/lib/api";

function SeverityChip({ severity }: { severity: UpdateSeverity }) {
  if (severity === "critical") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-500/15 text-red-300 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider">
        <ShieldAlert className="h-3 w-3" />
        Critical
      </span>
    );
  }
  if (severity === "security") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-orange-500/15 text-orange-300 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider">
        <ShieldAlert className="h-3 w-3" />
        Security
      </span>
    );
  }
  if (severity === "update") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-violet-500/15 text-violet-300 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider">
        Update
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 text-emerald-300 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider">
      <CheckCircle2 className="h-3 w-3" />
      Up to date
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
  const { data, loading, refresh } = useUpdateLockdown();

  return (
    <Dialog open={open} onClose={onClose} title="Software updates" maxWidth="max-w-2xl">
      <div className="space-y-4">
        {!data || data.error === "unknown" ? (
          <div className="text-center py-6 space-y-3">
            <p className="text-sm text-zinc-400">
              {loading ? "Checking for updates…" : "Could not check for updates right now."}
            </p>
            {recheckable && (
              <Button onClick={() => refresh(true)} disabled={loading}>
                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                Check again
              </Button>
            )}
          </div>
        ) : data.error === "disabled" ? (
          <div className="text-center py-6 space-y-3">
            <p className="text-sm text-zinc-400">
              Update checks are disabled on this server. Installed version: v{data.installed}.
            </p>
          </div>
        ) : data.error && !data.outdated && data.severity === "none" ? (
          <div className="text-center py-6 space-y-3">
            <p className="text-sm text-zinc-400">Could not check for updates right now.</p>
            {recheckable && (
              <Button onClick={() => refresh(true)} disabled={loading}>
                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                Check again
              </Button>
            )}
          </div>
        ) : data.outdated ? (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <SeverityChip severity={data.severity} />
              <p className="text-sm text-zinc-300">
                A newer version is available: <span className="text-zinc-500">v{data.installed}</span>{" "}
                <span className="text-zinc-600">→</span>{" "}
                <span className="font-semibold text-white">v{data.latest}</span>
              </p>
            </div>
            {data.severity === "security" || data.severity === "critical" ? (
              <div className="flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3">
                <AlertTriangle className="h-4 w-4 text-red-400 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-red-300">
                  Security-sensitive settings are locked until you update.
                  {data.skippedCount > 1 && ` You are skipping ${data.skippedCount} released versions.`}
                </p>
              </div>
            ) : (
              data.skippedCount > 1 && (
                <p className="text-xs text-zinc-500">
                  {data.skippedCount} released versions are included in this update.
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
                    <p className="text-xs text-zinc-600">No details recorded.</p>
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
                    View release on GitHub
                  </Button>
                );
              })()}
              {recheckable && (
                <Button variant="secondary" onClick={() => refresh(true)} disabled={loading}>
                  <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                  Re-check
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
              You are running the latest version (v{data.installed}).
            </p>
            {recheckable && (
              <Button variant="secondary" onClick={() => refresh(true)} disabled={loading}>
                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                Check again
              </Button>
            )}
          </div>
        )}
      </div>
    </Dialog>
  );
}
