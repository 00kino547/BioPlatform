import { useCallback, useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { startRegistration } from "@simplewebauthn/browser";
import { api, type Passkey } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Fingerprint, KeyRound, Plus, Trash2, ShieldCheck, Info } from "lucide-react";

export function SecurityTab() {
  const { user, refreshUser } = useAuth();
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
    setPasskeyBusy(true);
    try {
      const optionsRes = await api.registerPasskeyOptions(residentKey);
      if (!optionsRes.success || !optionsRes.data) {
        setMsg(optionsRes.error ?? "Could not start passkey registration");
        return;
      }
      const response = await startRegistration({ optionsJSON: optionsRes.data });
      const verifyRes = await api.registerPasskey(response, passkeyName.trim() || "Passkey", residentKey);
      if (!verifyRes.success) {
        setMsg(verifyRes.error ?? "Passkey registration failed");
        return;
      }
      setMsg(undefined, "Passkey registered.");
      setPasskeyName("");
      setAddingPasskey(false);
      await loadPasskeys();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Passkey registration cancelled";
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
      setMsg(undefined, "Passkey removed.");
    } else {
      setMsg(res.error ?? "Failed to remove passkey");
    }
  };

  const handleSetupTotp = async () => {
    setMsg();
    setTotpBusy(true);
    const res = await api.setupTotp();
    setTotpBusy(false);
    if (res.success && res.data) {
      setTotpSecret(res.data.secret);
      setTotpUrl(res.data.otpauthUrl);
    } else {
      setMsg(res.error ?? "Failed to start TOTP setup");
    }
  };

  const handleEnableTotp = async () => {
    setMsg();
    if (!totpCode.trim()) return;
    setTotpBusy(true);
    const res = await api.enableTotp(totpCode.trim());
    setTotpBusy(false);
    if (res.success) {
      setMsg(undefined, "Two-factor authentication enabled.");
      setTotpSecret(null);
      setTotpUrl(null);
      setTotpCode("");
      setTotpEnabled(true);
      await refreshUser();
    } else {
      setMsg(res.error ?? "Invalid verification code");
    }
  };

  const handleDisableTotp = async () => {
    setMsg();
    if (!totpCode.trim()) return;
    setTotpBusy(true);
    const res = await api.disableTotp(totpCode.trim());
    setTotpBusy(false);
    if (res.success) {
      setMsg(undefined, "Two-factor authentication disabled.");
      setTotpCode("");
      setShowDisable(false);
      setTotpEnabled(false);
      await refreshUser();
    } else {
      setMsg(res.error ?? "Invalid verification code");
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

  return (
    <div className="space-y-6">
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

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Fingerprint className="h-5 w-5 text-violet-400" />
            <div>
              <h3 className="text-sm font-medium text-white">Passkeys</h3>
              <p className="text-xs text-zinc-500">
                Sign in passwordless or use a passkey as a second factor.
              </p>
            </div>
          </div>
          {!addingPasskey && (
            <Button size="sm" onClick={() => setAddingPasskey(true)}>
              <Plus className="h-4 w-4" />
              Add passkey
            </Button>
          )}
        </div>

        {addingPasskey && (
          <div className="mb-4 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">Name</label>
              <input
                type="text"
                value={passkeyName}
                onChange={(e) => setPasskeyName(e.target.value)}
                placeholder="e.g. YubiKey, Phone"
                maxLength={64}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-800/50 px-3.5 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-2">Passkey type</label>
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => setResidentKey("nonResident")}
                  className={`w-full text-left rounded-lg border px-3.5 py-2.5 transition-colors ${
                    residentKey === "nonResident" ? "border-violet-500 bg-violet-500/10" : "border-zinc-700 hover:border-zinc-600"
                  }`}
                >
                  <p className="text-sm font-medium text-white">Non-resident (2FA / security key)</p>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Classic security-key credential. Requires your username first and works as a strong second factor. Uses no on-device slots.
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => setResidentKey("resident")}
                  className={`w-full text-left rounded-lg border px-3.5 py-2.5 transition-colors ${
                    residentKey === "resident" ? "border-violet-500 bg-violet-500/10" : "border-zinc-700 hover:border-zinc-600"
                  }`}
                >
                  <p className="text-sm font-medium text-white">Resident (Passwordless)</p>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Discoverable passkey stored on the device. Enables sign-in without entering your username. Uses one of the limited on-device slots (e.g. YubiKey: 32).
                  </p>
                </button>
              </div>
              <p className="flex items-center gap-1.5 text-[11px] text-zinc-500 mt-2">
                <Info className="h-3 w-3" />
                Falls back to a standard passkey automatically if your device can&apos;t create the chosen type.
              </p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleAddPasskey} disabled={passkeyBusy}>
                {passkeyBusy ? "Registering..." : "Register passkey"}
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setAddingPasskey(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {passkeys.length === 0 ? (
          <p className="text-sm text-zinc-500 text-center py-6">
            No passkeys yet. Add one to sign in passwordless.
          </p>
        ) : (
          <div className="space-y-2">
            {passkeys.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-3"
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
                      {p.residentKey ? "Resident" : "Non-resident"}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    {p.credentialId.slice(0, 16)}…
                    {p.lastUsedAt ? (
                      <span className="text-zinc-600"> · last used {new Date(p.lastUsedAt).toLocaleDateString()}</span>
                    ) : null}
                  </p>
                </div>
                <button
                  onClick={() => handleDeletePasskey(p.id)}
                  className="text-zinc-500 hover:text-red-400 transition-colors"
                  title="Remove passkey"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div id="security-totp-enabled" data-enabled={totpEnabled} className="hidden" />

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <KeyRound className="h-5 w-5 text-violet-400" />
            <div>
              <h3 className="text-sm font-medium text-white">Authenticator App (TOTP)</h3>
              <p className="text-xs text-zinc-500">
                Use Google Authenticator, Authy, or any TOTP app for a second factor.
              </p>
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
            {totpEnabled ? "Enabled" : "Disabled"}
          </span>
        </div>

        {!totpEnabled && !totpSecret && (
          <Button variant="secondary" onClick={handleSetupTotp} disabled={totpBusy}>
            {totpBusy ? "Starting..." : "Set up"}
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
                  Scan the QR code with your authenticator app, or enter this code manually:
                </p>
                <code className="block rounded-lg bg-zinc-800 px-3 py-2.5 text-sm font-mono text-violet-300 break-all select-all">
                  {totpSecret}
                </code>
                <div className="mt-4">
                  <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                    Enter the 6-digit code to confirm
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={totpCode}
                      onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      placeholder="••••••"
                      className="w-32 rounded-lg border border-zinc-700 bg-zinc-800/50 px-3.5 py-2.5 text-center text-lg tracking-[0.4em] text-white placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                    />
                    <Button onClick={handleEnableTotp} disabled={totpBusy || totpCode.length !== 6}>
                      {totpBusy ? "Enabling..." : "Enable"}
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
              Cancel
            </button>
          </div>
        )}

        {totpEnabled && (
          <div>
            {!showDisable ? (
              <Button variant="outline" size="sm" onClick={() => setShowDisable(true)}>
                Disable two-factor
              </Button>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="Current code"
                  className="w-32 rounded-lg border border-zinc-700 bg-zinc-800/50 px-3.5 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                />
                <Button size="sm" variant="outline" onClick={handleDisableTotp} disabled={totpBusy || totpCode.length !== 6}>
                  {totpBusy ? "Disabling..." : "Confirm disable"}
                </Button>
                <button
                  onClick={() => {
                    setShowDisable(false);
                    setTotpCode("");
                  }}
                  className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
