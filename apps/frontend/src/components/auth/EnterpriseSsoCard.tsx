import { useCallback, useEffect, useState } from "react";
import {
  api,
  type EnterpriseSsoConfig,
  type EnterpriseSsoIdentity,
} from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
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
        showError(res.error ?? "Could not save SSO configuration");
        return;
      }
      showSuccess("SSO configuration saved.");
      setEditing(false);
      await load();
    } catch {
      showError("Could not save SSO configuration");
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
      showSuccess("SSO provider removed.");
    } else {
      showError(res.error ?? "Could not remove the SSO provider");
    }
  };

  const testSignIn = async () => {
    if (!config) return;
    const res = await api.ssoEnterpriseStart(config.id, "login");
    if (res.success && res.data?.redirectUrl) {
      window.location.href = res.data.redirectUrl;
    } else {
      showError(res.error ?? "Could not start a test sign-in");
    }
  };

  const linkAccount = async () => {
    if (!config) return;
    const res = await api.ssoEnterpriseStart(config.id, "link");
    if (res.success && res.data?.redirectUrl) {
      window.location.href = res.data.redirectUrl;
    } else {
      showError(res.error ?? "Could not link this account");
    }
  };

  const unlinkIdentity = async (id: string) => {
    showError();
    const res = await api.ssoEnterpriseIdentityDelete(id);
    if (res.success) {
      setIdentities(identities.filter((i) => i.id !== id));
      showSuccess("SSO identity unlinked.");
    } else {
      showError(res.error ?? "Could not unlink this identity");
    }
  };

  if (!hasEnterprise) {
    return (
      <div className="mt-8">
        <LockedFeature
          feature="Business SSO"
          required="enterprise"
          title="Business SSO is an Enterprise feature"
          description="Add a corporate single sign-on provider (Microsoft Entra ID, Okta, Keycloak, Google Workspace…). Every social sign-in stays available on Free and Premium."
          note="Requires Enterprise · OIDC single sign-on"
        />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="mt-8 flex items-center justify-center py-10 text-sm text-zinc-500">
        <Loader2 className="h-4 w-4 animate-spin mr-2" />
        Loading SSO configuration...
      </div>
    );
  }

  return (
    <div className="mt-8 rounded-2xl border border-zinc-800/80 bg-zinc-900/30 p-6 sm:p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-amber-300" />
            <h2 className="text-base font-semibold text-white">Business SSO</h2>
          </div>
          <p className="mt-1 text-sm text-zinc-400">
            Single sign-on via any OIDC provider — Microsoft Entra ID, Okta, Keycloak, Google Workspace and more.
          </p>
        </div>
        {config && !editing && (
          <div className="flex items-center gap-2">
            <Button type="button" variant="secondary" onClick={testSignIn}>
              Test sign-in
            </Button>
            <Button type="button" variant="secondary" onClick={startEdit}>
              Edit
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
            You haven&apos;t connected a provider yet. Your users will see &quot;Continue with [provider]&quot; on the
            sign-in page, and every account whose verified email is on an allowed domain can sign in.
          </p>
          <Button type="button" onClick={startEdit}>
            Connect an OIDC provider
          </Button>
        </div>
      )}

      {editing && (
        <div className="mt-6 space-y-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-zinc-300">Provider name</label>
              <input
                className={inputClass}
                value={form.displayName}
                onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
                placeholder="Acme Corp"
                maxLength={64}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-zinc-300">Client ID</label>
              <input
                className={inputClass}
                value={form.clientId}
                onChange={(e) => setForm((f) => ({ ...f, clientId: e.target.value }))}
                placeholder="Your OIDC application client ID"
                maxLength={300}
              />
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-zinc-300">
              Issuer URL <span className="text-zinc-500">(or OIDC discovery document URL)</span>
            </label>
            <input
              className={inputClass}
              value={form.issuerUrl}
              onChange={(e) => setForm((f) => ({ ...f, issuerUrl: e.target.value }))}
              placeholder="https://login.microsoftonline.com/{tenant}/v2.0"
            />
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-zinc-300">
                Client secret {config ? <span className="text-zinc-500">(leave blank to keep)</span> : null}
              </label>
              <input
                type="password"
                className={inputClass}
                value={form.clientSecret}
                onChange={(e) => setForm((f) => ({ ...f, clientSecret: e.target.value }))}
                placeholder={config ? "••••••••••••" : "Required on first save"}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-zinc-300">Provider logo URL</label>
              <input
                className={inputClass}
                value={form.logoUrl}
                onChange={(e) => setForm((f) => ({ ...f, logoUrl: e.target.value }))}
                placeholder="https://…/logo.png (optional)"
              />
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-zinc-300">
              Allowed email domains{" "}
              <span className="text-zinc-500">(comma separated — empty allows any verified email)</span>
            </label>
            <input
              className={inputClass}
              value={form.allowedDomains}
              onChange={(e) => setForm((f) => ({ ...f, allowedDomains: e.target.value }))}
              placeholder="acme.com, sub.acme.com"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-zinc-300">Scopes</label>
            <input
              className={inputClass}
              value={form.scopes}
              onChange={(e) => setForm((f) => ({ ...f, scopes: e.target.value }))}
              placeholder="openid email profile"
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
              Enforce SSO on my account
              <span className="text-xs text-zinc-500">— password and social sign-in will be disabled for this account</span>
            </label>
            <label className="flex items-center gap-2 text-sm text-zinc-300">
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))}
                className="h-4 w-4 rounded border-zinc-700 bg-zinc-900 accent-violet-500"
              />
              Enabled
            </label>
          </div>
          <div className="flex items-center gap-3">
            <Button type="button" onClick={save} disabled={busy || !form.displayName || !form.issuerUrl || !form.clientId}>
              {busy ? "Saving..." : "Save configuration"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setEditing(false);
                showError();
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {config && !editing && (
        <div className="mt-6 rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
          <div className="flex flex-wrap items-center gap-x-8 gap-y-3 text-sm">
            <div>
              <div className="text-xs text-zinc-500">Provider</div>
              <div className="mt-0.5 font-medium text-white">{config.displayName}</div>
            </div>
            <div>
              <div className="text-xs text-zinc-500">Issuer</div>
              <div className="mt-0.5 font-medium text-white">{config.issuerUrl}</div>
            </div>
            <div>
              <div className="text-xs text-zinc-500">Client ID</div>
              <div className="mt-0.5 font-mono text-white">{config.clientId}</div>
            </div>
            <div>
              <div className="text-xs text-zinc-500">Secret</div>
              <div className="mt-0.5 font-mono text-zinc-400">{config.clientSecretMasked}</div>
            </div>
            <div>
              <div className="text-xs text-zinc-500">Linked accounts</div>
              <div className="mt-0.5 font-medium text-white">{config.identityCount}</div>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button type="button" variant="secondary" onClick={linkAccount}>
              <Link2 className="h-4 w-4" />
              Link this account
            </Button>
            {config.enforced && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/25 bg-amber-500/10 px-3 py-1 text-xs text-amber-300">
                <ShieldCheck className="h-3.5 w-3.5" />
                SSO enforced
              </span>
            )}
            {!config.enabled && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-700 bg-zinc-800/60 px-3 py-1 text-xs text-zinc-400">
                Disabled
              </span>
            )}
          </div>
          {confirmRemove ? (
            <div className="mt-4 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm">
              <p className="text-red-300">Remove this provider? Everyone currently signing in through it will lose this method.</p>
              <div className="mt-3 flex items-center gap-3">
                <Button type="button" onClick={remove} disabled={busy} className="bg-red-600 hover:bg-red-700 text-white">
                  <Trash2 className="h-4 w-4" />
                  Remove provider
                </Button>
                <Button type="button" variant="secondary" onClick={() => setConfirmRemove(false)}>
                  Cancel
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
                Remove provider
              </button>
            </div>
          )}
        </div>
      )}

      {identities.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-semibold text-zinc-300">Linked SSO identities</h3>
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
                  Unlink
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}