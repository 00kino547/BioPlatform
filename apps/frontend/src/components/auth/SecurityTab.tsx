import { useCallback, useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { startRegistration } from "@simplewebauthn/browser";
import { useTranslation } from "react-i18next";
import { api, type Passkey, type OAuthAccountsData, type OAuthConfig, type OAuthProvider } from "@/lib/api";
import { formatDate } from "@/lib/intl";
import { useAuth } from "@/contexts/useAuth";
import { Button } from "@/components/ui/button";
import { useUpdateLockdown } from "@/lib/useVersionCheck";
import { Fingerprint, KeyRound, Plus, Trash2, ShieldCheck, Info, Lock, Eye, EyeOff, ShieldAlert, Link2 } from "lucide-react";
import { EnterpriseSsoCard } from "@/components/auth/EnterpriseSsoCard";

// Brand names are trademarks and are never translated. This maps the provider
// data key (used in API calls and lookups) to its raw, untranslated display label.
const PROVIDER_BRANDS: Record<OAuthProvider, string> = {
  google: "Google",
  github: "GitHub",
  discord: "Discord",
  pocketbase: "PocketBase",
};

export function SecurityTab() {
  const { t } = useTranslation("auth");
  const { user, refreshUser } = useAuth();
  const { locked, data } = useUpdateLockdown();
  const [passkeys, setPasskeys] = useState<Passkey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [addingPasskey, setAddingPasskey] = useState(false);
  const [passkeyName, setPasskeyName] = useState("");
  const [residentKey, setResidentKey] = useState<"resident" | "nonResident">("nonResident");
  const [passkeyBusy, setPasskeyBusy] = useState(false);

  const [totpSecret, setTotpSecret] = useState<string | null>(null);
  const [totpUrl, setTotpUrl] = useState<string | null>(null);
  const [totpEnabled, setTotpEnabled] = useState(Boolean(user?.totpEnabled));
  const [totpCode, setTotpCode] = useState("");
  const [totpBusy, setTotpBusy] = useState(false);
  const [showDisable, setShowDisable] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);
  const [passwordBusy, setPasswordBusy] = useState(false);

  const [oauthData, setOauthData] = useState<OAuthAccountsData | null>(null);
  const [oauthConfig, setOauthConfig] = useState<OAuthConfig | null>(null);
  const [oauthLoading, setOauthLoading] = useState(true);
  const [oauthBusy, setOauthBusy] = useState(false);
  const [confirmingUnlink, setConfirmingUnlink] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.oauthAccounts(), api.ssoConfig()]).then(([accountsRes, configRes]) => {
      if (accountsRes.success && accountsRes.data) setOauthData(accountsRes.data);
      if (configRes.success && configRes.data) setOauthConfig(configRes.data);
      setOauthLoading(false);
    });
  }, []);

  const loadPasskeys = useCallback(async () => {
    const res = await api.getPasskeys();
    if (res.success && res.data) {
      setPasskeys(res.data);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadPasskeys();
  }, [loadPasskeys]);

  useEffect(() => {
    setTotpEnabled(Boolean(user?.totpEnabled));
  }, [user?.totpEnabled]);

  const setMsg = (err?: string, ok?: string) => {
    setError(err ?? "");
    setSuccess(ok ?? "");
  };

  const handleAddPasskey = async () => {
    setMsg();
    if (!currentPassword) {
      setMsg(t("security.enterCurrentPassword"));
      return;
    }
    setPasskeyBusy(true);
    try {
      const optionsRes = await api.registerPasskeyOptions(residentKey);
      if (!optionsRes.success || !optionsRes.data) {
        setMsg(optionsRes.error ?? t("security.couldNotStartPasskey"));
        return;
      }
      const response = await startRegistration({ optionsJSON: optionsRes.data });
      const verifyRes = await api.registerPasskey(response, passkeyName.trim() || "Passkey", residentKey, currentPassword);
      if (!verifyRes.success) {
        setMsg(verifyRes.error ?? t("security.passkeyRegistrationFailed"));
        return;
      }
      setMsg(undefined, t("security.passkeyRegistered"));
      setPasskeyName("");
      setAddingPasskey(false);
      setCurrentPassword("");
      await loadPasskeys();
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("security.passkeyRegistrationCancelled");
      setMsg(msg.toLowerCase().includes("cancel") ? undefined : msg);
    } finally {
      setPasskeyBusy(false);
    }
  };

  const handleDeletePasskey = async (id: string) => {
    setMsg();
    const res = await api.deletePasskey(id);
    if (res.success) {
      setPasskeys(passkeys.filter((p) => p.id !== id));
      setMsg(undefined, t("security.passkeyRemoved"));
    } else {
      setMsg(res.error ?? t("security.failedToRemovePasskey"));
    }
  };

  const handleSetupTotp = async () => {
    setMsg();
    if (!currentPassword) {
      setMsg(t("security.enterCurrentPassword"));
      return;
    }
    setTotpBusy(true);
    const res = await api.setupTotp(currentPassword);
    setTotpBusy(false);
    if (res.success && res.data) {
      setTotpSecret(res.data.secret);
      setTotpUrl(res.data.otpauthUrl);
      setCurrentPassword("");
    } else {
      setMsg(res.error ?? t("security.failedToStartTotp"));
    }
  };

  const handleEnableTotp = async () => {
    setMsg();
    if (!totpCode.trim()) return;
    setTotpBusy(true);
    const res = await api.enableTotp(totpCode.trim());
    setTotpBusy(false);
    if (res.success) {
      setMsg(undefined, t("security.totpEnabled"));
      setTotpSecret(null);
      setTotpUrl(null);
      setTotpCode("");
      setTotpEnabled(true);
      await refreshUser();
    } else {
      setMsg(res.error ?? t("security.invalidCode"));
    }
  };

  const handleDisableTotp = async () => {
    setMsg();
    if (!totpCode.trim()) return;
    setTotpBusy(true);
    const res = await api.disableTotp(totpCode.trim());
    setTotpBusy(false);
    if (res.success) {
      setMsg(undefined, t("security.totpDisabled"));
      setTotpCode("");
      setShowDisable(false);
      setTotpEnabled(false);
      await refreshUser();
    } else {
      setMsg(res.error ?? t("security.invalidCode"));
    }
  };

  const handleChangePassword = async () => {
    setMsg();
    if (!currentPassword) {
      setMsg(t("security.enterCurrentPassword"));
      return;
    }
    if (newPassword.length < 8) {
      setMsg(t("security.newPasswordMin"));
      return;
    }
    if (newPassword !== confirmPassword) {
      setMsg(t("security.passwordsDoNotMatch"));
      return;
    }
    setPasswordBusy(true);
    const res = await api.changePassword(currentPassword, newPassword);
    setPasswordBusy(false);
    if (res.success) {
      setMsg(undefined, t("security.passwordChanged"));
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } else {
      setMsg(res.error ?? t("security.failedToChangePassword"));
    }
  };

  const handleLinkProvider = async (provider: OAuthProvider) => {
    setMsg();
    setOauthBusy(true);
    const res = await api.ssoStart(provider, "link");
    setOauthBusy(false);
    if (!res.success || !res.data?.redirectUrl) {
      setMsg(res.error ?? t("security.couldNotStartLinking"));
      return;
    }
    window.location.href = res.data.redirectUrl;
  };

  const handleUnlink = async (provider: OAuthProvider, providerAccountId: string) => {
    setMsg();
    setOauthBusy(true);
    const res = await api.oauthUnlink(provider, providerAccountId);
    setOauthBusy(false);
    setConfirmingUnlink(null);
    if (res.success) {
      setOauthData((cur) =>
        cur
          ? { ...cur, accounts: cur.accounts.filter((a) => a.providerAccountId !== providerAccountId) }
          : cur
      );
      setMsg(undefined, t("security.providerRemoved"));
    } else {
      setMsg(res.error ?? t("security.failedToRemoveProvider"));
    }
  };

  const handleBypassToggle = async (value: boolean) => {
    setMsg();
    const res = await api.oauthSetSettings(value);
    if (res.success && res.data) {
      const oauthBypass2fa = res.data.oauthBypass2fa;
      setOauthData((cur) => (cur ? { ...cur, oauthBypass2fa } : cur));
      setMsg(undefined, t("security.bypassUpdated"));
    } else {
      setMsg(res.error ?? t("security.failedToUpdateSetting"));
    }
  };

  useEffect(() => {
    setTotpEnabled(Boolean(user?.totpEnabled));
  }, [user?.totpEnabled]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-700 border-t-violet-500" />
      </div>
    );
  }

  const remainingMethods = oauthData
    ? (oauthData.authMethods.password ? 1 : 0) + oauthData.accounts.length + oauthData.authMethods.passkeys
    : 0;
  const linkedProviders = new Set(oauthData?.accounts.map((a) => a.provider) ?? []);
  const linkProviders = (oauthConfig?.providers ?? []).filter((p) => !linkedProviders.has(p));

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-4 py-3 text-sm text-emerald-400">
          {success}
        </div>
      )}

      {locked && (
        <div className="flex items-start gap-3 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3">
          <ShieldAlert className="h-5 w-5 text-red-400 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-red-300">
            <p className="font-semibold">
              {t("security.lockdownRequired", { version: data?.latest ?? "…" })}
            </p>
            <p className="mt-0.5 text-red-300/80">
              {t("security.lockdownNotice")}
            </p>
          </div>
        </div>
      )}

      <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-3.5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Fingerprint className="h-5 w-5 text-violet-400" />
            <div>
              <h3 className="text-sm font-medium text-white">{t("security.passkeysTitle")}</h3>
              <p className="text-xs text-zinc-500">
                {t("security.passkeysDescription")}
              </p>
              <p className="text-xs text-zinc-500 mt-1">{t("security.stepUpRequired")}</p>
            </div>
          </div>
          {!addingPasskey && (
            <Button size="sm" onClick={() => setAddingPasskey(true)} disabled={locked}>
              <Plus className="h-4 w-4" />
              {t("security.addPasskey")}
            </Button>
          )}
        </div>

        {addingPasskey && (
          <div className="mb-3 rounded-lg border border-zinc-800 bg-zinc-900/50 p-3.5 space-y-3">
            <div>
              <label className="block text-[13px] font-medium text-zinc-300 mb-1.5">{t("security.nameLabel")}</label>
              <input
                type="text"
                value={passkeyName}
                onChange={(e) => setPasskeyName(e.target.value)}
                placeholder={t("security.namePlaceholder")}
                maxLength={64}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-2">{t("security.passkeyTypeLabel")}</label>
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => setResidentKey("nonResident")}
                  className={`w-full text-left rounded-lg border px-3 py-2 transition-colors ${
                    residentKey === "nonResident" ? "border-violet-500 bg-violet-500/10" : "border-zinc-700 hover:border-zinc-600"
                  }`}
                >
                  <p className="text-sm font-medium text-white">{t("security.nonResidentTitle")}</p>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    {t("security.nonResidentDescription")}
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => setResidentKey("resident")}
                  className={`w-full text-left rounded-lg border px-3 py-2 transition-colors ${
                    residentKey === "resident" ? "border-violet-500 bg-violet-500/10" : "border-zinc-700 hover:border-zinc-600"
                  }`}
                >
                  <p className="text-sm font-medium text-white">{t("security.residentTitle")}</p>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    {t("security.residentDescription")}
                  </p>
                </button>
              </div>
              <p className="flex items-center gap-1.5 text-xs text-zinc-500 mt-2">
                <Info className="h-3 w-3" />
                {t("security.fallbackNote")}
              </p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleAddPasskey} disabled={passkeyBusy || locked}>
                {passkeyBusy ? t("security.registering") : t("security.registerPasskey")}
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setAddingPasskey(false)}>
                {t("security.cancel")}
              </Button>
            </div>
          </div>
        )}

        {passkeys.length === 0 ? (
          <p className="text-sm text-zinc-500 text-center py-6">
            {t("security.noPasskeys")}
          </p>
        ) : (
          <div className="space-y-2">
            {passkeys.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/50 px-3.5 py-2.5"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-white">{p.name}</p>
                    <span
                      className={`text-[10px] font-medium uppercase tracking-wide px-2 py-0.5 rounded-full ${
                        p.residentKey
                          ? "bg-violet-500/10 text-violet-400 border border-violet-500/20"
                          : "bg-zinc-800 text-zinc-400 border border-zinc-700"
                      }`}
                    >
                      {p.residentKey ? t("security.resident") : t("security.nonResident")}
                    </span>
                    {p.authenticatorAttachment === "platform" ? (
                      <span className="text-[10px] font-medium uppercase tracking-wide px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700">
                        {t("security.thisDevice")}
                      </span>
                    ) : p.authenticatorAttachment === "cross-platform" ? (
                      <span className="text-[10px] font-medium uppercase tracking-wide px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700">
                        {t("security.securityKey")}
                      </span>
                    ) : null}
                  </div>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    {p.credentialDeviceType === "multiDevice"
                      ? t("security.syncedAcrossDevices")
                      : p.credentialDeviceType === "singleDevice"
                        ? t("security.deviceBound")
                        : null}
                    {p.lastUsedAt ? (
                      <span className="text-zinc-600">
                        {p.credentialDeviceType ? " · " : null}{t("security.lastUsed", { date: formatDate(p.lastUsedAt) })}
                      </span>
                    ) : null}
                  </p>
                </div>
                <button
                  onClick={() => handleDeletePasskey(p.id)}
                  disabled={locked}
                  className="text-zinc-500 hover:text-red-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  title={locked ? t("security.lockedTooltip") : t("security.removePasskey")}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div id="security-totp-enabled" data-enabled={totpEnabled} className="hidden" />

      <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-3.5">
        <div className="flex items-center gap-3 mb-4">
          <Link2 className="h-5 w-5 text-violet-400" />
          <div>
            <h3 className="text-sm font-medium text-white">{t("security.signInOptionsTitle")}</h3>
            <p className="text-xs text-zinc-500">
              {t("security.signInOptionsDescription")}
            </p>
          </div>
        </div>

        {oauthLoading ? (
          <div className="flex items-center justify-center py-6">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-700 border-t-violet-500" />
          </div>
        ) : oauthData ? (
          <div className="space-y-4">
            <div className="space-y-2">
              {oauthData.accounts.length === 0 ? (
                <p className="text-sm text-zinc-500 text-center py-4">
                  {t("security.noThirdPartyAccounts")}
                </p>
              ) : (
                oauthData.accounts.map((account) => (
                  <div
                    key={account.id}
                    className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/50 px-3.5 py-2.5"
                  >
                    <div>
                      <p className="text-sm font-medium text-white">{PROVIDER_BRANDS[account.provider]}</p>
                      <p className="text-xs text-zinc-500 mt-0.5">
                        {account.displayName || account.email || account.providerAccountId}
                      </p>
                    </div>
                    {confirmingUnlink === account.id ? (
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleUnlink(account.provider, account.providerAccountId)}
                          disabled={oauthBusy || locked}
                        >
                          {oauthBusy ? t("security.removing") : t("security.confirmRemove")}
                        </Button>
                        <button
                          onClick={() => setConfirmingUnlink(null)}
                          className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                        >
                          {t("security.cancel")}
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmingUnlink(account.id)}
                        disabled={locked || remainingMethods <= 1}
                        className="text-zinc-500 hover:text-red-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        title={
                          remainingMethods <= 1
                            ? t("security.cannotRemoveOnlyMethod")
                            : locked
                              ? t("security.lockedTooltip")
                              : t("security.remove")
                        }
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>

            {linkProviders.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {linkProviders.map((provider) => (
                  <Button
                    key={provider}
                    size="sm"
                    variant="secondary"
                    onClick={() => handleLinkProvider(provider)}
                    disabled={oauthBusy || locked}
                  >
                    {t("security.linkProvider", { provider: PROVIDER_BRANDS[provider] })}
                  </Button>
                ))}
              </div>
            )}

            {oauthData.twoFactorBypassAllowed && oauthData.accounts.length > 0 && (
              <div className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/50 px-3.5 py-3">
                <div>
                  <p className="text-sm font-medium text-white">{t("security.skip2faTitle")}</p>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    {t("security.skip2faDescription")}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleBypassToggle(!oauthData.oauthBypass2fa)}
                  className={`inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    oauthData.oauthBypass2fa ? "bg-violet-500" : "bg-zinc-700"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      oauthData.oauthBypass2fa ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>
            )}
          </div>
        ) : null}
      </div>

      <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-3.5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Lock className="h-5 w-5 text-violet-400" />
            <div>
              <h3 className="text-sm font-medium text-white">{t("security.passwordTitle")}</h3>
              <p className="text-xs text-zinc-500">
                {t("security.passwordDescription")}
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="relative">
            <label className="block text-[13px] font-medium text-zinc-300 mb-1.5">{t("security.currentPasswordLabel")}</label>
            <input
              type={showPasswords ? "text" : "password"}
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder={t("security.passwordPlaceholder")}
              autoComplete="current-password"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-2 pr-10 text-sm text-white placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
            />
            <button
              type="button"
              onClick={() => setShowPasswords((v) => !v)}
              className="absolute right-3 top-[38px] text-zinc-500 hover:text-zinc-300 transition-colors"
              title={showPasswords ? t("security.hidePasswords") : t("security.showPasswords")}
            >
              {showPasswords ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <div className="relative">
            <label className="block text-[13px] font-medium text-zinc-300 mb-1.5">{t("security.newPasswordLabel")}</label>
            <input
              type={showPasswords ? "text" : "password"}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder={t("security.newPasswordPlaceholder")}
              autoComplete="new-password"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-2 pr-10 text-sm text-white placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
            />
            <button
              type="button"
              onClick={() => setShowPasswords((v) => !v)}
              className="absolute right-3 top-[38px] text-zinc-500 hover:text-zinc-300 transition-colors"
              title={showPasswords ? t("security.hidePasswords") : t("security.showPasswords")}
            >
              {showPasswords ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <div className="relative">
            <label className="block text-[13px] font-medium text-zinc-300 mb-1.5">{t("security.confirmPasswordLabel")}</label>
            <input
              type={showPasswords ? "text" : "password"}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder={t("security.confirmPasswordPlaceholder")}
              autoComplete="new-password"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-2 pr-10 text-sm text-white placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
            />
            <button
              type="button"
              onClick={() => setShowPasswords((v) => !v)}
              className="absolute right-3 top-[38px] text-zinc-500 hover:text-zinc-300 transition-colors"
              title={showPasswords ? t("security.hidePasswords") : t("security.showPasswords")}
            >
              {showPasswords ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <Button onClick={handleChangePassword} disabled={passwordBusy || locked}>
            {passwordBusy ? t("security.updating") : t("security.updatePassword")}
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-3.5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <KeyRound className="h-5 w-5 text-violet-400" />
            <div>
              <h3 className="text-sm font-medium text-white">{t("security.totpTitle")}</h3>
              <p className="text-xs text-zinc-500">
                {t("security.totpDescription")}
              </p>
            <p className="text-xs text-zinc-500 mt-1">{t("security.stepUpRequired")}</p>
            </div>
          </div>
          <span
            className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border ${
              totpEnabled
                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                : "bg-zinc-800 text-zinc-400 border-zinc-700"
            }`}
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            {totpEnabled ? t("security.enabled") : t("security.disabled")}
          </span>
        </div>

        {!totpEnabled && !totpSecret && (
          <Button variant="secondary" onClick={handleSetupTotp} disabled={totpBusy || locked}>
            {totpBusy ? t("security.starting") : t("security.setUp")}
          </Button>
        )}

        {!totpEnabled && totpSecret && totpUrl && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-5 items-center sm:items-start">
              <div className="rounded-xl bg-white p-3">
                <QRCodeSVG value={totpUrl} size={168} />
              </div>
              <div className="flex-1 w-full">
                <p className="text-sm text-zinc-300 mb-2">
                  {t("security.scanQr")}
                </p>
                <code className="block rounded-lg bg-zinc-800 px-3 py-2.5 text-sm font-mono text-violet-300 break-all select-all">
                  {totpSecret}
                </code>
                <div className="mt-4">
                  <label className="block text-[13px] font-medium text-zinc-300 mb-1.5">
                    {t("security.enterSixDigit")}
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={totpCode}
                      onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      placeholder={t("security.codePlaceholder")}
                      className="w-32 rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-center text-lg tracking-[0.4em] text-white placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                    />
                    <Button onClick={handleEnableTotp} disabled={totpBusy || totpCode.length !== 6 || locked}>
                      {totpBusy ? t("security.enabling") : t("security.enable")}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
            <button
              onClick={() => {
                setTotpSecret(null);
                setTotpUrl(null);
                setTotpCode("");
              }}
              className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              {t("security.cancel")}
            </button>
          </div>
        )}

        {totpEnabled && (
          <div>
            {!showDisable ? (
              <Button variant="outline" size="sm" onClick={() => setShowDisable(true)} disabled={locked}>
                {t("security.disableTwoFactor")}
              </Button>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder={t("security.currentCodePlaceholder")}
                  className="w-32 rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                />
                <Button size="sm" variant="outline" onClick={handleDisableTotp} disabled={totpBusy || totpCode.length !== 6 || locked}>
                  {totpBusy ? t("security.disabling") : t("security.confirmDisable")}
                </Button>
                <button
                  onClick={() => {
                    setShowDisable(false);
                    setTotpCode("");
                  }}
                  className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  {t("security.cancel")}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <EnterpriseSsoCard />
    </div>
  );
}
