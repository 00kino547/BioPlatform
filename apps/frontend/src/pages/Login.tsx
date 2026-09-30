import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { branding } from "@/config/branding";
import { Button } from "@/components/ui/button";
import { SsoProviderButtons, EnterpriseSsoButtons } from "@/components/auth/SsoProviderButtons";
import { PocketBaseLoginButton } from "@/components/auth/PocketBaseLoginButton";
import { CaptchaWidget } from "@/components/auth/CaptchaWidget";
import { api, type TwoFactorRequired } from "@/lib/api";
import { OAUTH_TF_KEY } from "@/lib/oauthStorage";
import { AppFooter } from "@/components/layout/AppFooter";
import { KeyRound, Fingerprint, Lock } from "lucide-react";
import { usePageMeta } from "@/lib/seo";

type Stage = "identifier" | "method" | "password" | "twofactor";

export function Login() {
  const { login, loginWithPasskey, loginWithPasskeyDiscoverable, verifyTotp, verifyTwoFactorPasskey } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const fromOAuth = searchParams.get("tf") === "1";
  const [stage, setStage] = useState<Stage>("identifier");
  const [identifier, setIdentifier] = useState("");
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

  usePageMeta({ title: "Log In", description: `Sign in to ${branding.name} and manage your profile, links, and theme.`, url: "/login" });

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
          setError("Your two-factor session has expired. Sign in again.");
        }
      }
    }
  }, [fromOAuth]);

  const handleContinue = async () => {
    if (!identifier.trim()) return;
    setError("");
    setUnlockRequired(false);
    setUnlockSent(false);
    setLoading(true);

    const res = await api.loginStart(identifier.trim());
    setLoading(false);

    if (!res.success) {
      setError(res.error ?? "Something went wrong");
      return;
    }

    if (!res.data?.found) {
      setError("No account found with that username or email.");
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
      setError(res.error ?? "Failed to send verification email");
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
      setError(res.error ?? "Failed to send unlock email");
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
          <p className="mt-2 text-sm text-zinc-400">Sign in to your account</p>
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
                Your account is locked after too many failed attempts. Enter your username or email and we&apos;ll
                send you an unlock link.
              </p>
              {unlockSent ? (
                <p className="text-sm text-emerald-400">Unlock email sent — check your inbox.</p>
              ) : (
                <form onSubmit={handleSendUnlock} className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="username or you@example.com"
                    className="flex-1 rounded-lg border border-zinc-700 bg-zinc-900/50 px-3.5 py-2 text-sm text-white placeholder-zinc-500 outline-none transition-colors focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30"
                  />
                  <Button type="submit" disabled={loading} className="whitespace-nowrap">
                    {loading ? "Sending..." : "Send unlock email"}
                  </Button>
                </form>
              )}
            </div>
          )}

          {verifyEmailRequired && (
            <div className="rounded-lg bg-violet-500/10 border border-violet-500/25 px-4 py-3">
              <p className="text-sm text-violet-300 mb-2">
                Your email is not verified yet, so signing in is blocked until you confirm it. Enter your username or email
                and we&apos;ll send a fresh verification link.
              </p>
              {verifySent ? (
                <p className="text-sm text-emerald-400">Verification email sent — check your inbox.</p>
              ) : (
                <form onSubmit={handleResendVerification} className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="username or you@example.com"
                    className="flex-1 rounded-lg border border-zinc-700 bg-zinc-900/50 px-3.5 py-2 text-sm text-white placeholder-zinc-500 outline-none transition-colors focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30"
                  />
                  <Button type="submit" disabled={loading} className="whitespace-nowrap">
                    {loading ? "Sending..." : "Send verification email"}
                  </Button>
                </form>
              )}
            </div>
          )}

          {stage === "identifier" && (
            <>
              <div>
                <label htmlFor="identifier" className="block text-sm font-medium text-zinc-300 mb-1.5">
                  Username or Email
                </label>
                <input
                  id="identifier"
                  type="text"
                  autoComplete="username webauthn"
                  required
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-2.5 text-sm text-white placeholder-zinc-500 outline-none transition-colors focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30"
                  placeholder="username or you@example.com"
                />
              </div>
              <Button type="button" className="w-full h-11" onClick={handleContinue} disabled={loading}>
                {loading ? "Checking..." : "Continue"}
              </Button>
              <div className="flex items-center gap-3 my-2">
                <span className="h-px flex-1 bg-zinc-800" />
                <span className="text-xs text-zinc-500">or</span>
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
                Login with passkey
              </Button>
              <SsoProviderButtons />
              <PocketBaseLoginButton />
              <EnterpriseSsoButtons />
            </>
          )}

          {stage === "method" && (
            <>
              <div className="text-center">
                <p className="text-sm text-zinc-400">
                  Sign in as <span className="text-white font-medium">{identifier}</span>
                </p>
                <button
                  onClick={() => goBack("identifier")}
                  className="mt-1 text-xs text-violet-400 hover:text-violet-300 transition-colors"
                >
                  Not you? Use a different account
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
                  Passwordless (Passkey)
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full h-12"
                  onClick={() => goBack("password")}
                >
                  <KeyRound className="h-5 w-5" />
                  Password
                </Button>
              </div>
            </>
          )}

          {stage === "password" && (
            <form onSubmit={handlePassword} className="space-y-5">
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-zinc-300 mb-1.5">
                  Password
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
                {loading ? "Signing in..." : "Sign in"}
              </Button>
              <button
                type="button"
                onClick={() => goBack("method")}
                className="w-full text-center text-xs text-violet-400 hover:text-violet-300 transition-colors"
              >
                Back
              </button>
            </form>
          )}

          {stage === "twofactor" && twoFactor && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm text-zinc-300">
                <Lock className="h-4 w-4 text-violet-400" />
                Two-factor authentication required
              </div>

              {twoFactor.methods.totp && (
                <form onSubmit={handleTotpVerify} className="space-y-3">
                  <div>
                    <label htmlFor="totp" className="block text-sm font-medium text-zinc-300 mb-1.5">
                      Verification code
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
                    {loading ? "Verifying..." : "Verify"}
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
                  Use a Passkey
                </Button>
              )}

              <button
                type="button"
                onClick={() => (fromOAuth ? goBack("identifier") : goBack("method"))}
                className="w-full text-center text-xs text-violet-400 hover:text-violet-300 transition-colors"
              >
                Back
              </button>
            </div>
          )}
        </div>

        <p className="mt-6 text-center text-sm text-zinc-500">
          Don&apos;t have an account?{" "}
          <Link to="/register" className="text-violet-400 hover:text-violet-300 transition-colors font-medium">
            Register
          </Link>
        </p>
      </div>
      </div>
      <AppFooter />
    </div>
  );
}
