import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Mail as MailIcon } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { branding } from "@/config/branding";
import { Button } from "@/components/ui/button";
import { api, type OAuthSetupInfo } from "@/lib/api";
import { OAUTH_SETUP_KEY } from "@/lib/oauthStorage";
import { usePageMeta } from "@/lib/seo";
import { AppFooter } from "@/components/layout/AppFooter";

type CompleteField = "username" | "email" | "inviteCode";
type CompleteFieldErrors = Partial<Record<CompleteField, string>>;

const PROVIDER_LABEL: Record<OAuthSetupInfo["provider"], string> = {
  google: "Google",
  github: "GitHub",
  discord: "Discord",
  pocketbase: "PocketBase",
};

export function OAuthComplete() {
  const { setAuth } = useAuth();
  const navigate = useNavigate();

  const raw = sessionStorage.getItem(OAUTH_SETUP_KEY);
  let setup: OAuthSetupInfo | null = null;
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as OAuthSetupInfo;
      if (parsed?.status === "needs_setup" && parsed.signupToken) setup = parsed;
    } catch {
      setup = null;
    }
  }

  usePageMeta({ title: "Complete Sign-Up", description: `Finish creating your ${branding.name} account.` });

  const [username, setUsername] = useState(setup?.suggestedUsername ?? "");
  const [email, setEmail] = useState(setup?.email ?? "");
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<CompleteFieldErrors>({});
  const [loading, setLoading] = useState(false);
  const [verificationPending, setVerificationPending] = useState(false);
  const [verificationEmailSent, setVerificationEmailSent] = useState(false);

  if (!setup) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="w-full max-w-md text-center rounded-2xl border border-zinc-800/80 bg-zinc-900/30 p-7 sm:p-8">
            <p className="text-sm text-zinc-400">
              Your sign-up session has expired or is missing.
            </p>
            <Link
              to="/register"
              className="mt-4 inline-block text-sm text-violet-400 hover:text-violet-300 transition-colors font-medium"
            >
              Back to register
            </Link>
          </div>
        </div>
        <AppFooter />
      </div>
    );
  }

  const clearFieldError = (field: CompleteField) => {
    setFieldErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    const errors: CompleteFieldErrors = {};
    if (username.length < 3) errors.username = "Username must be at least 3 characters.";
    else if (username.length > 32) errors.username = "Username must be 32 characters or fewer.";
    else if (!/^[a-z0-9_-]+$/.test(username)) {
      errors.username = "Username can only contain lowercase letters, numbers, underscores, and hyphens.";
    }
    if (setup.requiresEmail && !email.trim()) errors.email = "Email is required.";
    else if (email.trim() && !/^\S+@\S+\.\S+$/.test(email.trim())) errors.email = "Email must be a valid email address.";
    if (setup.requiresInvite && !inviteCode.trim()) errors.inviteCode = "Invite code is required.";
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setLoading(true);
    const res = await api.oauthSignup({
      signupToken: setup.signupToken,
      username,
      email: email.trim() || undefined,
      inviteCode: inviteCode.trim() || undefined,
    });
    setLoading(false);

    if (res.success && res.data) {
      sessionStorage.removeItem(OAUTH_SETUP_KEY);
      // A3b — a self-typed email (≠ the provider's verified address) leaves the
      // account unverified: no session, the user must confirm the typed email.
      if (!("token" in res.data)) {
        setVerificationPending(true);
        setVerificationEmailSent(res.data.emailSent ?? false);
        return;
      }
      setAuth(res.data.token, res.data.user);
      navigate("/dashboard");
      return;
    }

    if (res.fieldErrors) {
      setFieldErrors(res.fieldErrors as CompleteFieldErrors);
      setError(res.error ?? "Please fix the highlighted fields.");
    } else {
      setError(res.error ?? "Registration failed");
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <Link to="/" className="text-2xl font-bold text-white tracking-tight">
              {branding.name}
            </Link>
            <p className="mt-2 text-sm text-zinc-400">
              {verificationPending
                ? "Finish verifying your email"
                : `Almost done — finish creating your account with ${PROVIDER_LABEL[setup.provider]}`}
            </p>
          </div>

          {verificationPending ? (
            <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/30 p-7 sm:p-8 text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-violet-500/10 border border-violet-500/30">
                <MailIcon className="h-6 w-6 text-violet-400" />
              </div>
              <h1 className="text-lg font-semibold text-white">Check your email</h1>
              <p className="mt-2 text-sm text-zinc-400 leading-relaxed">
                We sent a verification link to <span className="text-zinc-200 font-medium">{email}</span>. Click it to
                activate your account, then sign in.
              </p>
              {verificationEmailSent === false && (
                <p className="mt-3 text-xs text-amber-400/90">
                  The email could not be sent right now ({branding.name} email is not configured). Please try resending it
                  from the sign-in page later.
                </p>
              )}
              <Link to="/login" className="mt-6 inline-block w-full">
                <Button className="w-full h-11">Go to Sign In</Button>
              </Link>
            </div>
          ) : (
          <form
            onSubmit={handleSubmit}
            noValidate
            className="rounded-2xl border border-zinc-800/80 bg-zinc-900/30 p-7 sm:p-8 space-y-5"
          >
            {setup.avatar && (
              <div className="flex justify-center">
                <img src={setup.avatar} alt="" className="h-14 w-14 rounded-full border border-zinc-700" />
              </div>
            )}

            {error && (
              <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="username" className="block text-sm font-medium text-zinc-300 mb-1.5">
                Username
              </label>
              <input
                id="username"
                type="text"
                required
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value.toLowerCase());
                  clearFieldError("username");
                }}
                aria-invalid={Boolean(fieldErrors.username)}
                aria-describedby={fieldErrors.username ? "username-error" : undefined}
                className={`w-full rounded-lg border ${fieldErrors.username ? "border-red-500/70" : "border-zinc-800"} bg-zinc-900/50 px-4 py-2.5 text-sm text-white placeholder-zinc-500 outline-none transition-colors focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30 font-mono`}
                placeholder="your-username"
                minLength={3}
                maxLength={32}
                pattern="[a-z0-9_-]+"
              />
              {fieldErrors.username && <p id="username-error" className="mt-1.5 text-xs text-red-400">{fieldErrors.username}</p>}
              <p className="mt-1.5 text-xs text-zinc-500">
                Your profile will be at {new URL(branding.url).host}/<span className="text-zinc-400">{username || "username"}</span>
              </p>
            </div>

            {setup.requiresEmail && (
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-zinc-300 mb-1.5">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  maxLength={254}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    clearFieldError("email");
                  }}
                  aria-invalid={Boolean(fieldErrors.email)}
                  aria-describedby={fieldErrors.email ? "email-error" : undefined}
                  className={`w-full rounded-lg border ${fieldErrors.email ? "border-red-500/70" : "border-zinc-800"} bg-zinc-900/50 px-4 py-2.5 text-sm text-white placeholder-zinc-500 outline-none transition-colors focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30`}
                  placeholder="you@example.com"
                />
                {fieldErrors.email && <p id="email-error" className="mt-1.5 text-xs text-red-400">{fieldErrors.email}</p>}
              </div>
            )}

            {setup.requiresInvite && (
              <div>
                <label htmlFor="inviteCode" className="block text-sm font-medium text-zinc-300 mb-1.5">
                  Invite Code
                </label>
                <input
                  id="inviteCode"
                  type="text"
                  required
                  value={inviteCode}
                  maxLength={128}
                  onChange={(e) => {
                    setInviteCode(e.target.value);
                    clearFieldError("inviteCode");
                  }}
                  aria-invalid={Boolean(fieldErrors.inviteCode)}
                  aria-describedby={fieldErrors.inviteCode ? "inviteCode-error" : undefined}
                  className={`w-full rounded-lg border ${fieldErrors.inviteCode ? "border-red-500/70" : "border-zinc-800"} bg-zinc-900/50 px-4 py-2.5 text-sm text-white placeholder-zinc-500 outline-none transition-colors focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30 font-mono`}
                  placeholder="Enter your invite code"
                />
                {fieldErrors.inviteCode && <p id="inviteCode-error" className="mt-1.5 text-xs text-red-400">{fieldErrors.inviteCode}</p>}
                <p className="mt-1.5 text-xs text-zinc-500">
                  Registration is invite-only. Get a code from an existing member.
                </p>
              </div>
            )}

            <Button type="submit" className="w-full h-11" disabled={loading}>
              {loading ? "Creating account..." : "Create account"}
            </Button>
          </form>
          )}

          <p className="mt-6 text-center text-sm text-zinc-500">
            Prefer email and password?{" "}
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