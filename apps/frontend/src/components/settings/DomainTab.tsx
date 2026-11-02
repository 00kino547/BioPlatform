import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Trans, useTranslation } from "react-i18next";
import { api, type Profile, type ProfileDomain } from "@/lib/api";
import { formatDate } from "@/lib/intl";
import { useAuth } from "@/contexts/useAuth";
import { LockedFeature } from "@/components/ui/LockedFeature";
import { Button } from "@/components/ui/button";
import { Globe, ShieldCheck, ShieldAlert, CheckCircle2, RefreshCw, Trash2, Loader2 } from "lucide-react";

const HOSTNAME_RE = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

type Translate = ReturnType<typeof useTranslation>["t"];

// Status pill label per server status; classes stay visual-only.
function statusBadge(status: ProfileDomain["status"], t: Translate) {
  switch (status) {
    case "PENDING_VERIFICATION":
      return { label: t("domain.statusPendingVerification"), className: "bg-amber-500/10 text-amber-400 border-amber-500/30" };
    case "VERIFIED":
      return { label: t("domain.statusVerified"), className: "bg-blue-500/10 text-blue-400 border-blue-500/30" };
    case "ACTIVE":
      return { label: t("domain.statusActive"), className: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" };
    case "REJECTED":
      return { label: t("domain.statusRejected"), className: "bg-red-500/10 text-red-400 border-red-500/30" };
  }
}

export function DomainTab({ profileId, profiles }: { profileId?: string; profiles: Profile[] }) {
  // All user-facing strings come from the `dashboard` namespace (domain.* keys).
  const { t } = useTranslation("dashboard");
  const { user } = useAuth();
  const [domain, setDomain] = useState<ProfileDomain | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [rootTarget, setRootTarget] = useState("");

  const tier = user?.tier ?? "FREE";
  const hasAccess = tier === "PRO" || tier === "ENTERPRISE";

  const load = useCallback(async () => {
    if (!profileId) return;
    const res = await api.getProfileDomain(profileId);
    if (res.success) {
      setDomain(res.data ?? null);
      setRootTarget(res.data?.rootTarget ?? "");
    } else {
      setError(res.error ?? t("domain.toasts.loadFailed"));
    }
    setLoading(false);
  }, [profileId, t]);

  useEffect(() => {
    load();
  }, [load]);

  const submitRequest = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!profileId) return;
    setError("");
    setMessage("");
    const value = input.trim().toLowerCase();
    if (!HOSTNAME_RE.test(value) || value.startsWith("www.")) {
      setError(t("domain.toasts.invalidHostname"));
      return;
    }
    setBusy(true);
    const res = await api.requestProfileDomain(profileId, value);
    setBusy(false);
    if (!res.success) {
      setError(res.error ?? t("domain.toasts.requestFailed"));
      return;
    }
    setDomain(res.data ?? null);
    setInput("");
  };

  const handleVerify = async () => {
    if (!profileId) return;
    setError("");
    setMessage("");
    setVerifying(true);
    const res = await api.verifyProfileDomain(profileId);
    setVerifying(false);
    if (!res.success) {
      setError(res.error ?? t("domain.toasts.verificationFailed"));
      return;
    }
    setDomain(res.data ?? null);
    setMessage(t("domain.toasts.verified"));
    setTimeout(() => setMessage(""), 4000);
  };

  const handleRoot = async (target: string) => {
    if (!profileId) return;
    setError("");
    const res = await api.setProfileDomainRoot(profileId, target || null);
    if (!res.success) {
      setError(res.error ?? t("domain.toasts.rootUpdateFailed"));
      return;
    }
    setDomain(res.data ?? null);
    setRootTarget(res.data?.rootTarget ?? "");
    setMessage(t("domain.toasts.rootUpdated"));
    setTimeout(() => setMessage(""), 2500);
  };

  const handleRemove = async () => {
    if (!profileId) return;
    setError("");
    const res = await api.removeProfileDomain(profileId);
    if (!res.success) {
      setError(res.error ?? t("domain.toasts.removeFailed"));
      return;
    }
    setDomain(null);
    setRootTarget("");
  };

  if (loading) {
    return <p className="text-sm text-zinc-500 text-center py-12">{t("domain.loading")}</p>;
  }

  if (!hasAccess) {
    return (
      <LockedFeature
        feature={t("domain.feature")}
        required="premium"
        title={t("domain.featureTitle")}
        description={t("domain.featureDescription")}
        note={t("domain.featureNote")}
      />
    );
  }

  const publicProfiles = profiles.filter((p) => p.isPublic);

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">{error}</div>
      )}
      {message && (
        <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-4 py-3 text-sm text-emerald-400">{message}</div>
      )}

      {!domain && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-3.5">
          <div className="flex items-center gap-3 mb-4">
            <Globe className="h-5 w-5 text-violet-400" />
            <div>
              <h3 className="text-sm font-medium text-white">{t("domain.connectTitle")}</h3>
              <p className="text-xs text-zinc-500">{t("domain.connectDescription")}</p>
            </div>
          </div>
          <form onSubmit={submitRequest} className="flex flex-col sm:flex-row gap-3">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t("domain.placeholder")}
              className="flex-1 rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
            <Button type="submit" disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {t("domain.requestDomain")}
            </Button>
          </form>
        </div>
      )}

      {domain && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-3.5">
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <Globe className="h-5 w-5 text-violet-400" />
            <span className="text-sm font-semibold text-white">{domain.domain}</span>
            <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${statusBadge(domain.status, t).className}`}>
              {statusBadge(domain.status, t).label}
            </span>
          </div>

          {domain.status === "PENDING_VERIFICATION" && (
            <div className="space-y-4">
              <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-4 space-y-3">
                <p className="text-xs text-zinc-400">
                  {t("domain.addRecord")} <span className="text-zinc-200">{t("domain.txtRecord")}</span> {t("domain.addRecordSuffix")}
                </p>
                <div>
                  <p className="text-xs text-zinc-500 mb-1">{t("domain.recordName")}</p>
                  <code className="block rounded bg-zinc-800/70 px-3 py-2 text-xs text-emerald-400 break-all">_bioplatform.{domain.domain}</code>
                </div>
                <div>
                  <p className="text-xs text-zinc-500 mb-1">{t("domain.value")}</p>
                  <code className="block rounded bg-zinc-800/70 px-3 py-2 text-xs text-emerald-400 break-all">{domain.verificationToken}</code>
                </div>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button onClick={handleVerify} disabled={verifying}>
                  {verifying ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  {verifying ? t("domain.checkingDns") : t("domain.verifyNow")}
                </Button>
                <Button variant="ghost" onClick={handleRemove}>
                  <Trash2 className="h-4 w-4" /> {t("domain.removeRequest")}
                </Button>
              </div>
            </div>
          )}

          {domain.status === "VERIFIED" && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 rounded-lg border border-blue-500/30 bg-blue-500/10 p-4">
                <ShieldCheck className="h-5 w-5 text-blue-400 shrink-0 mt-0.5" />
                <p className="text-sm text-zinc-300">{t("domain.verifiedNotice")}</p>
              </div>
              <Button variant="ghost" onClick={handleRemove}>
                <Trash2 className="h-4 w-4" /> {t("domain.removeRequest")}
              </Button>
            </div>
          )}

          {domain.status === "ACTIVE" && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4">
                <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />
                <p className="text-sm text-zinc-300">
                  <Trans
                    ns="dashboard"
                    i18nKey="domain.liveAt"
                    values={{ domain: domain.domain }}
                    components={{ 0: <span className="text-white font-medium" /> }}
                  />
                </p>
              </div>
              {domain.tlsStatus === "ISSUED" && (
                <div className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-400">
                  <ShieldCheck className="h-4 w-4 shrink-0" />
                  <span>
                    {t("domain.certActive")}
                    {domain.tlsExpiresAt ? t("domain.certRenews", { date: formatDate(domain.tlsExpiresAt) }) : ""}.
                  </span>
                </div>
              )}
              {domain.tlsStatus === "PENDING" && (
                <div className="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-400">
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                  <span>{t("domain.certIssuing")}</span>
                </div>
              )}
              {domain.tlsStatus === "FAILED" && (
                <div className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-400">
                  <ShieldAlert className="h-4 w-4 shrink-0" />
                  <span>
                    {t("domain.certFailed")}{domain.tlsError ? `: ${domain.tlsError}` : ""}{t("domain.certFailedSuffix")}
                  </span>
                </div>
              )}
              <div>
                <p className="text-xs text-zinc-500 mb-2">{t("domain.rootOfDomain", { domain: domain.domain })}</p>
                <select
                  value={rootTarget}
                  onChange={(e) => handleRoot(e.target.value)}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                >
                  <option value="">{t("domain.rootLandingPage")}</option>
                  {publicProfiles.map((p) => (
                    <option key={p.id} value={p.slug}>
                      {t("domain.rootProfile", { name: p.displayName || p.slug, slug: p.slug })}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-zinc-500 mt-2">
                  {rootTarget
                    ? t("domain.rootProfileNotice", { slug: rootTarget })
                    : t("domain.rootLandingNotice", {
                        slug: profiles.find((p) => p.id === profileId)?.slug ?? "",
                      })}
                </p>
              </div>
              <Button variant="ghost" onClick={handleRemove}>
                <Trash2 className="h-4 w-4" /> {t("domain.disconnect")}
              </Button>
            </div>
          )}

          {domain.status === "REJECTED" && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 rounded-lg border border-red-500/30 bg-red-500/10 p-4">
                <ShieldAlert className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
                <p className="text-sm text-zinc-300">{t("domain.rejectedNotice")}</p>
              </div>
              <div className="flex flex-col sm:flex-row gap-3">
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={t("domain.placeholder")}
                  className="flex-1 rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
                <Button onClick={submitRequest} disabled={busy}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {t("domain.requestNew")}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
