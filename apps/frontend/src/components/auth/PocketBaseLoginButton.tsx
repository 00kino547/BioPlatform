import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Database, ShieldCheck, KeyRound } from "lucide-react";
import { api, type PocketBaseAuthConfig } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { OAUTH_SETUP_KEY, OAUTH_TF_KEY } from "@/lib/oauthStorage";

interface PocketBaseLoginButtonProps {
  mode?: "login" | "signup";
  invite?: string;
  className?: string;
}

// Reads a PocketBase error body and returns a human-readable message.
function pbErrorMessage(body: unknown): string {
  if (body && typeof body === "object" && "message" in body) {
    const message = (body as { message?: unknown }).message;
    if (typeof message === "string" && message) return message;
  }
  return "PocketBase rejected the sign-in";
}

// Sign in against the operator-controlled PocketBase through the same-origin
// proxy (clientUrl, normally /api/pb-speed). The password never touches our
// backend — it is POSTed straight to PocketBase from the SPA and only the
// resulting token is handed to /auth/oauth/pocketbase/exchange.
export function PocketBaseLoginButton({ invite, className }: PocketBaseLoginButtonProps) {
  const navigate = useNavigate();
  const { setAuth } = useAuth();
  const [config, setConfig] = useState<PocketBaseAuthConfig | null>(null);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"credentials" | "otp">("credentials");
  const [identity, setIdentity] = useState("");
  const [password, setPassword] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [pbMfaId, setPbMfaId] = useState("");
  const [pbOtpId, setPbOtpId] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.pocketbaseConfig().then((res) => {
      if (res.success && res.data?.enabled) setConfig(res.data);
    });
  }, []);

  const requestJson = useCallback(
    async (path: string, body: Record<string, unknown>) => {
      if (!config?.clientUrl) throw new Error("PocketBase sign-in is not configured");
      const res = await fetch(`${config.clientUrl}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const parsed = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      if (res.status === 401 && parsed && typeof parsed.mfaId === "string") {
        // PocketBase requires a second factor (MFA). Return the mfaId so the
        // caller can run the OTP leg.
        return { mfaId: parsed.mfaId as string };
      }
      if (!res.ok) throw new Error(pbErrorMessage(parsed));
      return { body: parsed };
    },
    [config]
  );

  // Runs our /exchange: handles logged_in / needs_two_factor / needs_setup.
  const completeExchange = useCallback(
    async (token: string) => {
      setLoading(true);
      try {
        const res = await api.pocketbaseExchange({ token, invite });
        if (!res.success || !res.data) {
          setError(res.error ?? "Could not complete sign-in");
          return;
        }
        if (res.data.status === "logged_in") {
          setAuth(res.data.token, res.data.user);
          navigate("/dashboard");
          return;
        }
        if (res.data.status === "needs_two_factor") {
          sessionStorage.setItem(
            OAUTH_TF_KEY,
            JSON.stringify({ methods: res.data.methods, twoFactorToken: res.data.twoFactorToken })
          );
          navigate("/login?tf=1");
          return;
        }
        if (res.data.status === "needs_setup") {
          sessionStorage.setItem(OAUTH_SETUP_KEY, JSON.stringify(res.data));
          navigate("/oauth/complete");
          return;
        }
        setError("Unexpected sign-in response");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not complete sign-in");
      } finally {
        setLoading(false);
      }
    },
    [invite, navigate, setAuth]
  );

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result = await requestJson(
        `/api/collections/${config?.authCollection ?? "users"}/auth-with-password`,
        { identity: identity.trim(), password }
      );
      if (result.mfaId) {
        // Second factor needed: request an OTP from PocketBase (sent to the
        // user's PB email), then confirm it with the code they enter.
        const otpRes = await requestJson(`/api/collections/${config?.authCollection ?? "users"}/request-otp`, {
          email: identity.trim(),
        });
        const otpId = otpRes.body?.otpId;
        if (typeof otpId !== "string") throw new Error("PocketBase did not return an OTP request");
        setPbMfaId(result.mfaId);
        setPbOtpId(otpId);
        setStep("otp");
        setError("Check your PocketBase email for a one-time code.");
        return;
      }
      const token = result.body?.token;
      if (typeof token !== "string") throw new Error("PocketBase did not return an auth token");
      await completeExchange(token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "PocketBase rejected the sign-in");
    } finally {
      setLoading(false);
    }
  };

  const handleOtpSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result = await requestJson(`/api/collections/${config?.authCollection ?? "users"}/auth-with-otp`, {
        otpId: pbOtpId,
        password: otpCode.trim(),
        mfaId: pbMfaId,
      });
      if (result.mfaId) {
        setError("That code was not accepted. Try again.");
        return;
      }
      const token = result.body?.token;
      if (typeof token !== "string") throw new Error("PocketBase did not return an auth token");
      await completeExchange(token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "PocketBase rejected the code");
    } finally {
      setLoading(false);
    }
  };

  if (!config) return null;

  return (
    <div className={className}>
      {!open ? (
        <Button
          type="button"
          variant="secondary"
          className="w-full h-11"
          onClick={() => setOpen(true)}
          disabled={loading}
        >
          <Database className="h-4.5 w-4.5 text-zinc-300" />
          Continue with PocketBase
        </Button>
      ) : step === "credentials" ? (
        <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
          <div className="flex items-center gap-2 text-sm text-zinc-300">
            <ShieldCheck className="h-4 w-4 text-violet-400" />
            Sign in with your PocketBase account
          </div>
          {error && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-sm text-red-400">
              {error}
            </div>
          )}
          <input
            type="text"
            autoComplete="username"
            required
            value={identity}
            onChange={(e) => setIdentity(e.target.value)}
            placeholder="PocketBase email or username"
            className="w-full rounded-lg border border-zinc-800 bg-zinc-900/50 px-3.5 py-2.5 text-sm text-white placeholder-zinc-500 outline-none transition-colors focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30"
          />
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="w-full rounded-lg border border-zinc-800 bg-zinc-900/50 px-3.5 py-2.5 text-sm text-white placeholder-zinc-500 outline-none transition-colors focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30"
          />
          <Button type="submit" className="w-full h-10" disabled={loading}>
            {loading ? "Signing in..." : "Sign in with PocketBase"}
          </Button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="w-full text-center text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            Cancel
          </button>
        </form>
      ) : (
        <form onSubmit={handleOtpSubmit} className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
          <div className="flex items-center gap-2 text-sm text-zinc-300">
            <KeyRound className="h-4 w-4 text-violet-400" />
            Enter your one-time code
          </div>
          {error && (
            <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2 text-sm text-amber-300">
              {error}
            </div>
          )}
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            value={otpCode}
            onChange={(e) => setOtpCode(e.target.value)}
            placeholder="6-digit code"
            className="w-full rounded-lg border border-zinc-800 bg-zinc-900/50 px-3.5 py-2.5 text-sm text-white placeholder-zinc-500 outline-none transition-colors focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30 text-center tracking-[0.3em]"
          />
          <Button type="submit" className="w-full h-10" disabled={loading}>
            {loading ? "Verifying..." : "Verify code"}
          </Button>
          <button
            type="button"
            onClick={() => {
              setStep("credentials");
              setError("");
            }}
            className="w-full text-center text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            Use a different PocketBase account
          </button>
        </form>
      )}
    </div>
  );
}