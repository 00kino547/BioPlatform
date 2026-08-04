import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { branding } from "@/config/branding";
import { Button } from "@/components/ui/button";
import { api, type LoginMethods, type TwoFactorRequired } from "@/lib/api";
import { KeyRound, Fingerprint, Lock } from "lucide-react";

type Stage = "identifier" | "method" | "password" | "twofactor";

export function Login() {
  const { login, loginWithPasskey, verifyTotp, verifyTwoFactorPasskey } = useAuth();
  const navigate = useNavigate();
  const [stage, setStage] = useState<Stage>("identifier");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [methods, setMethods] = useState<LoginMethods | null>(null);
  const [twoFactor, setTwoFactor] = useState<TwoFactorRequired | null>(null);
  const [totpCode, setTotpCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleContinue = async () => {
    if (!identifier.trim()) return;
    setError("");
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

    setMethods(res.data.methods ?? { password: true, passkey: false, totp: false });
    setStage("method");
  };

  const handlePasswordless = async () => {
    setError("");
    setLoading(true);
    const err = await loginWithPasskey(identifier.trim());
    setLoading(false);
    if (err) {
      setError(err);
    } else {
      navigate("/dashboard");
    }
  };

  const handlePassword = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const result = await login(identifier.trim(), password);
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
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
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
                  variant={methods?.passkey ? "default" : "secondary"}
                  onClick={handlePasswordless}
                  disabled={!methods?.passkey || loading}
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
              <Button type="submit" className="w-full h-11" disabled={loading}>
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
                onClick={() => goBack("method")}
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
  );
}
