import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Trans, useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/useAuth";
import { branding } from "@/config/branding";
import { Button } from "@/components/ui/button";
import { SsoProviderButtons, EnterpriseSsoButtons } from "@/components/auth/SsoProviderButtons";
import { PocketBaseLoginButton } from "@/components/auth/PocketBaseLoginButton";
import { CaptchaWidget } from "@/components/auth/CaptchaWidget";
import { api, type TwoFactorRequired } from "@/lib/api";
import { OAUTH_TF_KEY } from "@/lib/oauthStorage";
import { AppFooter } from "@/components/layout/AppFooter";
import { BuyInviteModal } from "@/components/invites/BuyInviteModal";
import { usePolicyContext } from "@/lib/usePolicyContext";
import { asEmailHint } from "@/lib/emailHint";
import { KeyRound, Fingerprint, Lock } from "lucide-react";
import { usePageMeta } from "@/lib/seo";

type Stage = "identifier" | "method" | "password" | "twofactor";

export function Login() {
  const { t } = useTranslation("auth");
  const { login, loginWithPasskey, loginWithPasskeyDiscoverable, verifyTotp, verifyTwoFactorPasskey } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const fromOAuth = searchParams.get("tf") === "1";
  const [stage, setStage] = useState<Stage>("identifier");
  const [identifier, setIdentifier] = useState("");
  // Store availability decides whether this page offers a way to get a code.
  const ctx = usePolicyContext();
  const storeOpen = ctx?.invites?.purchaseEnabled === true;
  const emailHint = asEmailHint(identifier);
  const inviteHref = emailHint ? `/invites?email=${encodeURIComponent(emailHint)}` : "/invites";
  const [password, setPassword] = useState("");
  const [twoFactor, setTwoFactor] = useState<TwoFactorRequired | null>(null);
  const [totpCode, setTotpCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [unlockRequired, setUnlockRequired] = useState(false);
  const [unlockSent, setUnlockSent] = useState(false);
  const [verifyEmailRequired, setVerifyEmailRequired] = useState(false);
  const [verifySent, setVerifySent] = useState(false);
  const [captchaToken, setCaptchaToken] = useState("");
  const [captchaEnabled, setCaptchaEnabled] = useState(false);
  const [captchaNonce, setCaptchaNonce] = useState(0);

  usePageMeta({ title: t("login.metaTitle"), description: t("login.metaDescription", { name: branding.name }), url: "/login" });

  useEffect(() => {
    if (fromOAuth) {
      const raw = sessionStorage.getItem(OAUTH_TF_KEY);
      sessionStorage.removeItem(OAUTH_TF_KEY);
      if (raw) {
        try {
          const stored = JSON.parse(raw) as { methods: { totp: boolean; passkey: boolean }; twoFactorToken: string };
          setTwoFactor({ requiresTwoFactor: true, ...stored });
          setStage("twofactor");
        } catch {
          setError(t("login.twoFactorExpired"));
        }
      }
    }
    // `t` is a dependency so the error text re-resolves on a live language switch.
  }, [fromOAuth, t]);

  const handleContinue = async () => {
    if (!identifier.trim()) return;
    setError("");
    setUnlockRequired(false);
    setUnlockSent(false);
    setLoading(true);

    const res = await api.loginStart(identifier.trim());
    setLoading(false);

    if (!res.success) {
      setError(res.error ?? t("login.genericError"));
      return;
    }

    if (!res.data?.found) {
      setError(t("login.noAccount"));
      return;
    }

    setStage("method");
  };

  const handlePasswordless = async () => {
    setError("");
    setLoading(true);
    const result = await loginWithPasskey(identifier.trim());
    setLoading(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    if (result.twoFactor) {
      setTwoFactor(result.twoFactor);
      setStage("twofactor");
      return;
    }
    navigate("/dashboard");
  };

  const handlePasskeyDiscoverable = async () => {
    setError("");
    setLoading(true);
    const result = await loginWithPasskeyDiscoverable();
    setLoading(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    if (result.twoFactor) {
      setTwoFactor(result.twoFactor);
      setStage("twofactor");
      return;
    }
    navigate("/dashboard");
  };

  const handlePassword = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setUnlockRequired(false);
    setUnlockSent(false);
    setVerifyEmailRequired(false);
    setVerifySent(false);
    setLoading(true);
    const result = await login(identifier.trim(), password, captchaEnabled ? captchaToken : undefined);
    setLoading(false);

    if (result.error) {
      setError(result.error);
      setUnlockRequired(Boolean(result.unlockRequired));
      setVerifyEmailRequired(Boolean(result.verifyEmailRequired));
      if (captchaEnabled) {
        setCaptchaToken("");
        setCaptchaNonce((n) => n + 1);
      }
      return;
    }

    if (result.twoFactor) {
      setTwoFactor(result.twoFactor);
      setStage("twofactor");
      return;
    }

    navigate("/dashboard");
  };

  const handleResendVerification = async (e: FormEvent) => {
    e.preventDefault();
    if (!identifier.trim()) return;
    setError("");
    setVerifySent(false);
    setLoading(true);
    const res = await api.resendVerificationEmail(identifier.trim());
    setLoading(false);
    if (!res.success) {
      setError(res.error ?? t("login.resendVerificationFailed"));
      return;
    }
    setVerifySent(true);
  };

  const handleSendUnlock = async (e: FormEvent) => {
    e.preventDefault();
    if (!identifier.trim()) return;
    setError("");
    setUnlockSent(false);
    setLoading(true);
    const res = await api.requestUnlock(identifier.trim());
    setLoading(false);
    if (!res.success) {
      setError(res.error ?? t("login.sendUnlockFailed"));
      return;
    }
    setUnlockSent(true);
  };

  const handleTotpVerify = async (e: FormEvent) => {
    e.preventDefault();
    if (!twoFactor) return;
    setError("");
    setLoading(true);
    const err = await verifyTotp(twoFactor.twoFactorToken, totpCode);
    setLoading(false);
    if (err) {
      setError(err);
    } else {
      navigate("/dashboard");
    }
  };

  const handleTwoFactorPasskey = async () => {
    if (!twoFactor) return;
    setError("");
    setLoading(true);
    const err = await verifyTwoFactorPasskey(twoFactor.twoFactorToken);
    setLoading(false);
    if (err) {
      setError(err);
    } else {
      navigate("/dashboard");
    }
  };

  const goBack = (s: Stage) => {
    setError("");
    setStage(s);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="flex-1 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link to="/" className="text-2xl font-bold text-white tracking-tight">
            {branding.name}
          </Link>
          <p className="mt-2 text-sm text-zinc-400">{t("login.subtitle")}</p>
        </div>

        <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/30 p-7 sm:p-8 space-y-5">
          {error && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}

          {unlockRequired && (
            <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 px-4 py-3">
              <p className="text-sm text-amber-300 mb-2">
                {t("login.lockedMessage")}
              </p>
              {unlockSent ? (
                <p className="text-sm text-emerald-400">{t("login.unlockSent")}</p>
              ) : (
                <form onSubmit={handleSendUnlock} className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder={t("login.identifierPlaceholder")}
                    className="flex-1 rounded-lg border border-zinc-700 bg-zinc-900/50 px-3.5 py-2 text-sm text-white placeholder-zinc-500 outline-none transition-colors focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30"
                  />
                  <Button type="submit" disabled={loading} className="whitespace-nowrap">
                    {loading ? t("login.sending") : t("login.sendUnlockEmail")}
                  </Button>
                </form>
              )}
            </div>
          )}

          {verifyEmailRequired && (
            <div className="rounded-lg bg-violet-500/10 border border-violet-500/25 px-4 py-3">
              <p className="text-sm text-violet-300 mb-2">
                {t("login.unverifiedMessage")}
              </p>
              {verifySent ? (
                <p className="text-sm text-emerald-400">{t("login.verificationSent")}</p>
              ) : (
                <form onSubmit={handleResendVerification} className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder={t("login.identifierPlaceholder")}
                    className="flex-1 rounded-lg border border-zinc-700 bg-zinc-900/50 px-3.5 py-2 text-sm text-white placeholder-zinc-500 outline-none transition-colors focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30"
                  />
                  <Button type="submit" disabled={loading} className="whitespace-nowrap">
                    {loading ? t("login.sending") : t("login.sendVerificationEmail")}
                  </Button>
                </form>
              )}
            </div>
          )}

          {stage === "identifier" && (
            <>
              <div>
                <label htmlFor="identifier" className="block text-sm font-medium text-zinc-300 mb-1.5">
                  {t("login.identifierLabel")}
                </label>
                <input
                  id="identifier"
                  type="text"
                  autoComplete="username webauthn"
                  required
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-2.5 text-sm text-white placeholder-zinc-500 outline-none transition-colors focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30"
                  placeholder={t("login.identifierPlaceholder")}
                />
              </div>
              <Button type="button" className="w-full h-11" onClick={handleContinue} disabled={loading}>
                {loading ? t("login.checking") : t("login.continue")}
              </Button>
              <div className="flex items-center gap-3 my-2">
                <span className="h-px flex-1 bg-zinc-800" />
                <span className="text-xs text-zinc-500">{t("login.or")}</span>
                <span className="h-px flex-1 bg-zinc-800" />
              </div>
              <Button
                type="button"
                variant="secondary"
                className="w-full h-11"
                onClick={handlePasskeyDiscoverable}
                disabled={loading}
              >
                <Fingerprint className="h-5 w-5" />
                {t("login.loginWithPasskey")}
              </Button>
              <SsoProviderButtons />
              <PocketBaseLoginButton />
              <EnterpriseSsoButtons />
            </>
          )}

          {stage === "method" && (
            <>
              <div className="text-center">
                {/* login.signInAs uses the <Trans> tag form so the identifier keeps its styled span. */}
                <p className="text-sm text-zinc-400">
                  <Trans
                    i18nKey="login.signInAs"
                    ns="auth"
                    values={{ identifier }}
                    components={[<span key="identifier" className="text-white font-medium" />]}
                  />
                </p>
                <button
                  onClick={() => goBack("identifier")}
                  className="mt-1 text-xs text-violet-400 hover:text-violet-300 transition-colors"
                >
                  {t("login.notYou")}
                </button>
              </div>
              <div className="space-y-3">
                <Button
                  type="button"
                  className="w-full h-12"
                  variant="secondary"
                  onClick={handlePasswordless}
                  disabled={loading}
                >
                  <Fingerprint className="h-5 w-5" />
                  {t("login.passwordless")}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full h-12"
                  onClick={() => goBack("password")}
                >
                  <KeyRound className="h-5 w-5" />
                  {t("login.password")}
                </Button>
              </div>
            </>
          )}

          {stage === "password" && (
            <form onSubmit={handlePassword} className="space-y-5">
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-zinc-300 mb-1.5">
                  {t("login.password")}
                </label>
                <input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-2.5 text-sm text-white placeholder-zinc-500 outline-none transition-colors focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30"
                  placeholder="••••••••"
                />
              </div>
              <CaptchaWidget
                onToken={setCaptchaToken}
                onEnabledChange={setCaptchaEnabled}
                resetKey={captchaNonce}
              />
              <Button type="submit" className="w-full h-11" disabled={loading || (captchaEnabled && !captchaToken)}>
                {loading ? t("login.signingIn") : t("login.signIn")}
              </Button>
              <button
                type="button"
                onClick={() => goBack("method")}
                className="w-full text-center text-xs text-violet-400 hover:text-violet-300 transition-colors"
              >
                {t("login.back")}
              </button>
            </form>
          )}

          {stage === "twofactor" && twoFactor && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm text-zinc-300">
                <Lock className="h-4 w-4 text-violet-400" />
                {t("login.twoFactorRequired")}
              </div>

              {twoFactor.methods.totp && (
                <form onSubmit={handleTotpVerify} className="space-y-3">
                  <div>
                    <label htmlFor="totp" className="block text-sm font-medium text-zinc-300 mb-1.5">
                      {t("login.verificationCode")}
                    </label>
                    <input
                      id="totp"
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      required
                      value={totpCode}
                      onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      className="w-full rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-2.5 text-center text-xl tracking-[0.5em] text-white placeholder-zinc-600 outline-none transition-colors focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30"
                      placeholder="••••••"
                    />
                  </div>
                  <Button type="submit" className="w-full h-11" disabled={loading}>
                    {loading ? t("login.verifying") : t("login.verify")}
                  </Button>
                </form>
              )}

              {twoFactor.methods.passkey && (
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full h-11"
                  onClick={handleTwoFactorPasskey}
                  disabled={loading}
                >
                  <Fingerprint className="h-5 w-5" />
                  {t("login.usePasskey")}
                </Button>
              )}

              <button
                type="button"
                onClick={() => (fromOAuth ? goBack("identifier") : goBack("method"))}
                className="w-full text-center text-xs text-violet-400 hover:text-violet-300 transition-colors"
              >
                {t("login.back")}
              </button>
            </div>
          )}
        </div>

        <p className="mt-6 text-center text-sm text-zinc-500">
          {t("login.noAccountPrompt")}{" "}
          <Link to="/register" className="text-violet-400 hover:text-violet-300 transition-colors font-medium">
            {t("login.registerLink")}
          </Link>
        </p>

        {/*
          Signing in without a code is a dead end, so the store is offered here too.
          Login takes a username *or* an email, so the hint is only used when the
          field actually holds an address.
        */}
        {storeOpen ? (
          <div className="mt-4 flex flex-col items-center gap-2">
            <p className="text-center text-xs text-zinc-500">
              {t("login.noInviteYet")}{" "}
              <a href={inviteHref} className="text-violet-400 transition-colors hover:text-violet-300">
                {t("login.buyOneHere")}
              </a>{" "}
              {t("login.registerWithCode")}
            </p>
            <BuyInviteModal email={emailHint} />
          </div>
        ) : null}
      </div>
      </div>
      <AppFooter />
    </div>
  );
}
