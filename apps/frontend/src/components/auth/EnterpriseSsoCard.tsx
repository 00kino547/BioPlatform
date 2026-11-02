import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  api,
  type EnterpriseSsoConfig,
  type EnterpriseSsoIdentity,
} from "@/lib/api";
import { useAuth } from "@/contexts/useAuth";
import { Button } from "@/components/ui/button";
import { LockedFeature } from "@/components/ui/LockedFeature";
import { Building2, Link2, Loader2, ShieldCheck, Trash2 } from "lucide-react";

const inputClass =
  "w-full rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-2.5 text-sm text-white placeholder-zinc-500 outline-none transition-colors focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30";

interface ConfigForm {
  displayName: string;
  issuerUrl: string;
  clientId: string;
  clientSecret: string;
  logoUrl: string;
  allowedDomains: string;
  scopes: string;
  enforced: boolean;
  enabled: boolean;
}

const emptyForm: ConfigForm = {
  displayName: "",
  issuerUrl: "",
  clientId: "",
  clientSecret: "",
  logoUrl: "",
  allowedDomains: "",
  scopes: "openid email profile",
  enforced: false,
  enabled: true,
};

export function EnterpriseSsoCard() {
  const { t } = useTranslation("auth");
  const { user } = useAuth();
  const hasEnterprise = user?.apiLevel === "enterprise";

  const [config, setConfig] = useState<EnterpriseSsoConfig | null>(null);
  const [identities, setIdentities] = useState<EnterpriseSsoIdentity[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [form, setForm] = useState<ConfigForm>(emptyForm);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const load = useCallback(async () => {
    const [configRes, identitiesRes] = await Promise.all([
      api.ssoEnterpriseConfig(),
      api.ssoEnterpriseIdentities().catch(() => null),
    ]);
    if (configRes.success) setConfig(configRes.data ?? null);
    if (identitiesRes?.success) setIdentities(identitiesRes.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (hasEnterprise) load();
    else setLoading(false);
  }, [hasEnterprise, load]);

  const showError = (err?: string) => {
    setError(err ?? "");
    setSuccess("");
  };
  const showSuccess = (msg: string) => {
    setSuccess(msg);
    setError("");
  };

  const startEdit = () => {
    if (!config) {
      setForm(emptyForm);
    } else {
      setForm({
        displayName: config.displayName,
        issuerUrl: config.issuerUrl,
        clientId: config.clientId,
        clientSecret: "",
        logoUrl: config.logoUrl ?? "",
        allowedDomains: config.allowedDomains,
        scopes: config.scopes,
        enforced: config.enforced,
        enabled: config.enabled,
      });
    }
    setEditing(true);
    setConfirmRemove(false);
  };

  const save = async () => {
    showError();
    setBusy(true);
    try {
      const res = await api.ssoEnterpriseSave({
        issuerUrl: form.issuerUrl,
        clientId: form.clientId,
        clientSecret: form.clientSecret || undefined,
        scopes: form.scopes,
        displayName: form.displayName,
        logoUrl: form.logoUrl || undefined,
        allowedDomains: form.allowedDomains,
        enforced: form.enforced,
        enabled: form.enabled,
      });
      if (!res.success || !res.data) {
        showError(res.error ?? t("enterpriseSso.saveFailed"));
        return;
      }
      showSuccess(t("enterpriseSso.saved"));
      setEditing(false);
      await load();
    } catch {
      showError(t("enterpriseSso.saveFailed"));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    showError();
    setBusy(true);
    const res = await api.ssoEnterpriseDelete();
    setBusy(false);
    if (res.success) {
      setConfig(null);
      setIdentities([]);
      setEditing(false);
      setConfirmRemove(false);
      showSuccess(t("enterpriseSso.removed"));
    } else {
      showError(res.error ?? t("enterpriseSso.removeFailed"));
    }
  };

  const testSignIn = async () => {
    if (!config) return;
    const res = await api.ssoEnterpriseStart(config.id, "login");
    if (res.success && res.data?.redirectUrl) {
      window.location.href = res.data.redirectUrl;
    } else {
      showError(res.error ?? t("enterpriseSso.testSignInFailed"));
    }
  };

  const linkAccount = async () => {
    if (!config) return;
    const res = await api.ssoEnterpriseStart(config.id, "link");
    if (res.success && res.data?.redirectUrl) {
      window.location.href = res.data.redirectUrl;
    } else {
      showError(res.error ?? t("enterpriseSso.linkFailed"));
    }
  };

  const unlinkIdentity = async (id: string) => {
    showError();
    const res = await api.ssoEnterpriseIdentityDelete(id);
    if (res.success) {
      setIdentities(identities.filter((i) => i.id !== id));
      showSuccess(t("enterpriseSso.identityUnlinked"));
    } else {
      showError(res.error ?? t("enterpriseSso.unlinkFailed"));
    }
  };

  if (!hasEnterprise) {
    return (
      <div className="mt-8">
        <LockedFeature
          feature={t("enterpriseSso.featureName")}
          required="enterprise"
          title={t("enterpriseSso.lockedTitle")}
          description={t("enterpriseSso.lockedDescription")}
          note={t("enterpriseSso.lockedNote")}
        />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="mt-8 flex items-center justify-center py-10 text-sm text-zinc-500">
        <Loader2 className="h-4 w-4 animate-spin mr-2" />
        {t("enterpriseSso.loading")}
      </div>
    );
  }

  return (
    <div className="mt-8 rounded-2xl border border-zinc-800/80 bg-zinc-900/30 p-6 sm:p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-amber-300" />
            <h2 className="text-base font-semibold text-white">{t("enterpriseSso.title")}</h2>
          </div>
          <p className="mt-1 text-sm text-zinc-400">
            {t("enterpriseSso.subtitle")}
          </p>
        </div>
        {config && !editing && (
          <div className="flex items-center gap-2">
            <Button type="button" variant="secondary" onClick={testSignIn}>
              {t("enterpriseSso.testSignIn")}
            </Button>
            <Button type="button" variant="secondary" onClick={startEdit}>
              {t("enterpriseSso.edit")}
            </Button>
          </div>
        )}
      </div>

      {(error || success) && (
        <div
          className={`mt-4 rounded-lg border px-4 py-3 text-sm ${
            error
              ? "border-red-500/20 bg-red-500/10 text-red-400"
              : "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
          }`}
        >
          {error || success}
        </div>
      )}

      {!config && !editing && (
        <div className="mt-6 flex flex-col items-start gap-4 rounded-xl border border-dashed border-zinc-700/80 bg-zinc-900/20 p-5">
          <p className="text-sm text-zinc-400">
            {t("enterpriseSso.emptyHint")}
          </p>
          <Button type="button" onClick={startEdit}>
            {t("enterpriseSso.connectProvider")}
          </Button>
        </div>
      )}

      {editing && (
        <div className="mt-6 space-y-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-zinc-300">{t("enterpriseSso.providerNameLabel")}</label>
              <input
                className={inputClass}
                value={form.displayName}
                onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
                placeholder={t("enterpriseSso.providerNamePlaceholder")}
                maxLength={64}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-zinc-300">{t("enterpriseSso.clientIdLabel")}</label>
              <input
                className={inputClass}
                value={form.clientId}
                onChange={(e) => setForm((f) => ({ ...f, clientId: e.target.value }))}
                placeholder={t("enterpriseSso.clientIdPlaceholder")}
                maxLength={300}
              />
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-zinc-300">
              {t("enterpriseSso.issuerUrlLabel")} <span className="text-zinc-500">{t("enterpriseSso.issuerUrlHint")}</span>
            </label>
            <input
              className={inputClass}
              value={form.issuerUrl}
              onChange={(e) => setForm((f) => ({ ...f, issuerUrl: e.target.value }))}
              placeholder={t("enterpriseSso.issuerUrlPlaceholder")}
            />
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-zinc-300">
                {t("enterpriseSso.clientSecretLabel")} {config ? <span className="text-zinc-500">{t("enterpriseSso.clientSecretKeep")}</span> : null}
              </label>
              <input
                type="password"
                className={inputClass}
                value={form.clientSecret}
                onChange={(e) => setForm((f) => ({ ...f, clientSecret: e.target.value }))}
                placeholder={config ? "••••••••••••" : t("enterpriseSso.clientSecretRequired")}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-zinc-300">{t("enterpriseSso.logoUrlLabel")}</label>
              <input
                className={inputClass}
                value={form.logoUrl}
                onChange={(e) => setForm((f) => ({ ...f, logoUrl: e.target.value }))}
                placeholder={t("enterpriseSso.logoUrlPlaceholder")}
              />
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-zinc-300">
              {t("enterpriseSso.allowedDomainsLabel")}{" "}
              <span className="text-zinc-500">{t("enterpriseSso.allowedDomainsHint")}</span>
            </label>
            <input
              className={inputClass}
              value={form.allowedDomains}
              onChange={(e) => setForm((f) => ({ ...f, allowedDomains: e.target.value }))}
              placeholder={t("enterpriseSso.allowedDomainsPlaceholder")}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-zinc-300">{t("enterpriseSso.scopesLabel")}</label>
            <input
              className={inputClass}
              value={form.scopes}
              onChange={(e) => setForm((f) => ({ ...f, scopes: e.target.value }))}
              placeholder={t("enterpriseSso.scopesPlaceholder")}
            />
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <label className="flex items-center gap-2 text-sm text-zinc-300">
              <input
                type="checkbox"
                checked={form.enforced}
                onChange={(e) => setForm((f) => ({ ...f, enforced: e.target.checked }))}
                className="h-4 w-4 rounded border-zinc-700 bg-zinc-900 accent-violet-500"
              />
              {t("enterpriseSso.enforceLabel")}
              <span className="text-xs text-zinc-500">{t("enterpriseSso.enforceHint")}</span>
            </label>
            <label className="flex items-center gap-2 text-sm text-zinc-300">
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))}
                className="h-4 w-4 rounded border-zinc-700 bg-zinc-900 accent-violet-500"
              />
              {t("security.enabled")}
            </label>
          </div>
          <div className="flex items-center gap-3">
            <Button type="button" onClick={save} disabled={busy || !form.displayName || !form.issuerUrl || !form.clientId}>
              {busy ? t("enterpriseSso.saving") : t("enterpriseSso.save")}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setEditing(false);
                showError();
              }}
            >
              {t("security.cancel")}
            </Button>
          </div>
        </div>
      )}

      {config && !editing && (
        <div className="mt-6 rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
          <div className="flex flex-wrap items-center gap-x-8 gap-y-3 text-sm">
            <div>
              <div className="text-xs text-zinc-500">{t("enterpriseSso.providerLabel")}</div>
              <div className="mt-0.5 font-medium text-white">{config.displayName}</div>
            </div>
            <div>
              <div className="text-xs text-zinc-500">{t("enterpriseSso.issuerLabel")}</div>
              <div className="mt-0.5 font-medium text-white">{config.issuerUrl}</div>
            </div>
            <div>
              <div className="text-xs text-zinc-500">{t("enterpriseSso.clientIdLabel")}</div>
              <div className="mt-0.5 font-mono text-white">{config.clientId}</div>
            </div>
            <div>
              <div className="text-xs text-zinc-500">{t("enterpriseSso.secretLabel")}</div>
              <div className="mt-0.5 font-mono text-zinc-400">{config.clientSecretMasked}</div>
            </div>
            <div>
              <div className="text-xs text-zinc-500">{t("enterpriseSso.linkedAccountsLabel")}</div>
              <div className="mt-0.5 font-medium text-white">{config.identityCount}</div>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button type="button" variant="secondary" onClick={linkAccount}>
              <Link2 className="h-4 w-4" />
              {t("enterpriseSso.linkAccount")}
            </Button>
            {config.enforced && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/25 bg-amber-500/10 px-3 py-1 text-xs text-amber-300">
                <ShieldCheck className="h-3.5 w-3.5" />
                {t("enterpriseSso.enforced")}
              </span>
            )}
            {!config.enabled && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-700 bg-zinc-800/60 px-3 py-1 text-xs text-zinc-400">
                {t("security.disabled")}
              </span>
            )}
          </div>
          {confirmRemove ? (
            <div className="mt-4 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm">
              <p className="text-red-300">{t("enterpriseSso.removeConfirm")}</p>
              <div className="mt-3 flex items-center gap-3">
                <Button type="button" onClick={remove} disabled={busy} className="bg-red-600 hover:bg-red-700 text-white">
                  <Trash2 className="h-4 w-4" />
                  {t("enterpriseSso.removeProvider")}
                </Button>
                <Button type="button" variant="secondary" onClick={() => setConfirmRemove(false)}>
                  {t("security.cancel")}
                </Button>
              </div>
            </div>
          ) : (
            <div className="mt-4">
              <button
                type="button"
                onClick={() => setConfirmRemove(true)}
                className="inline-flex items-center gap-1.5 text-sm text-red-400 transition-colors hover:text-red-300"
              >
                <Trash2 className="h-4 w-4" />
                {t("enterpriseSso.removeProvider")}
              </button>
            </div>
          )}
        </div>
      )}

      {identities.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-semibold text-zinc-300">{t("enterpriseSso.linkedIdentities")}</h3>
          <div className="mt-3 space-y-2">
            {identities.map((identity) => (
              <div
                key={identity.id}
                className="flex items-center justify-between gap-4 rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  {identity.sso.logoUrl ? (
                    <img src={identity.sso.logoUrl} alt="" className="h-5 w-5 rounded object-contain" referrerPolicy="no-referrer" />
                  ) : (
                    <Building2 className="h-5 w-5 text-amber-300" />
                  )}
                  <div>
                    <div className="text-sm text-white">{identity.sso.displayName}</div>
                    <div className="text-xs text-zinc-500">{identity.email}</div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => unlinkIdentity(identity.id)}
                  className="text-sm text-zinc-400 transition-colors hover:text-red-400"
                >
                  {t("enterpriseSso.unlink")}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
