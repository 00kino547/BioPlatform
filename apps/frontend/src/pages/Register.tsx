import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Mail as MailIcon } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { branding } from "@/config/branding";
import { Button } from "@/components/ui/button";
import { SsoProviderButtons, EnterpriseSsoButtons } from "@/components/auth/SsoProviderButtons";
import { PocketBaseLoginButton } from "@/components/auth/PocketBaseLoginButton";
import { CaptchaWidget } from "@/components/auth/CaptchaWidget";
import { usePageMeta } from "@/lib/seo";
import { AppFooter } from "@/components/layout/AppFooter";
import { BuyInviteModal } from "@/components/invites/BuyInviteModal";
import { usePolicyContext } from "@/lib/usePolicyContext";
import type { InvitePurchaseSummary } from "@/lib/api";

type RegisterField = "username" | "email" | "password" | "inviteCode" | "acceptedPolicies";
type RegisterFieldErrors = Partial<Record<RegisterField, string>>;

export function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  usePageMeta({ title: "Create Account", description: `Create a free account on ${branding.name} and get your own profile page.`, url: "/register" });
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");

  /*
   * A visitor who buys an invite still has to register with a code, so the order
   * id is kept and surfaced rather than leaving them to hunt through their inbox.
   */
  const [purchasedOrder, setPurchasedOrder] = useState<string | null>(null);
  const ctx = usePolicyContext();
  const storeOpen = ctx?.invites?.purchaseEnabled === true;
  const inviteHref = email.trim().includes("@") ? `/invites?email=${encodeURIComponent(email.trim())}` : "/invites";
  const onInvitePurchased = (order: InvitePurchaseSummary) => setPurchasedOrder(order.id);
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState(searchParams.get("invite") ?? "");
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<RegisterFieldErrors>({});
  const [loading, setLoading] = useState(false);
  const [captchaToken, setCaptchaToken] = useState("");
  const [captchaEnabled, setCaptchaEnabled] = useState(false);
  const [captchaNonce, setCaptchaNonce] = useState(0);
  const [acceptedPolicies, setAcceptedPolicies] = useState(false);
  const [newsletterOptIn, setNewsletterOptIn] = useState(false);
  const [verificationPending, setVerificationPending] = useState(false);
  const [verificationEmailSent, setVerificationEmailSent] = useState(false);

  const clearFieldError = (field: RegisterField) => {
    setFieldErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  };

  const validate = (): RegisterFieldErrors => {
    const errors: RegisterFieldErrors = {};
    if (!username) errors.username = "Username is required.";
    else if (username.length < 3) errors.username = "Username must be at least 3 characters.";
    else if (username.length > 32) errors.username = "Username must be 32 characters or fewer.";
    else if (!/^[a-z0-9_-]+$/.test(username)) {
      errors.username = "Username can only contain lowercase letters, numbers, underscores, and hyphens.";
    }

    if (!email.trim()) errors.email = "Email is required.";
    else if (email.length > 254) errors.email = "Email must be 254 characters or fewer.";
    else if (!/^\S+@\S+\.\S+$/.test(email.trim())) errors.email = "Email must be a valid email address.";

    if (!password) errors.password = "Password is required.";
    else if (password.length < 8) errors.password = "Password must be at least 8 characters.";
    else if (password.length > 128) errors.password = "Password must be 128 characters or fewer.";

    if (!inviteCode.trim()) errors.inviteCode = "Invite code is required.";
    else if (inviteCode.length > 128) errors.inviteCode = "Invite code must be 128 characters or fewer.";

    if (!acceptedPolicies) errors.acceptedPolicies = "You must accept the Terms of Service and Privacy Policy.";
    return errors;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    const validationErrors = validate();
    setFieldErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) return;

    setLoading(true);

    const result = await register({ username, email, password, inviteCode, captchaToken: captchaEnabled ? captchaToken : undefined, acceptedPolicies: true, newsletterOptIn });
    setLoading(false);

    if (result.needsVerification) {
      // A3b — account created but the email is unverified: double opt-in. No
      // session exists yet, the user must click the link in the email.
      setVerificationPending(true);
      setVerificationEmailSent(result.emailSent ?? false);
      return;
    }

    if (result.error || result.fieldErrors) {
      setError(result.error ?? "Please fix the highlighted fields.");
      setFieldErrors(result.fieldErrors ?? {});
      if (captchaEnabled) {
        setCaptchaToken("");
        setCaptchaNonce((n) => n + 1);
      }
    } else {
      navigate("/dashboard");
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
          <p className="mt-2 text-sm text-zinc-400">Create your account</p>
        </div>

        {verificationPending ? (
          <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/30 p-7 sm:p-8 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-violet-500/10 border border-violet-500/30">
              <MailIcon className="h-6 w-6 text-violet-400" />
            </div>
            <h1 className="text-lg font-semibold text-white">Check your email</h1>
            <p className="mt-2 text-sm text-zinc-400 leading-relaxed">
              We sent a verification link to{" "}
              <span className="text-zinc-200 font-medium">{email}</span>. Click it to activate your account, then sign in.
            </p>
            {verificationEmailSent === false && (
              <p className="mt-3 text-xs text-amber-400/90">
                The email could not be sent right now ({branding.name} email is not configured). Please try resending it from
                the sign-in page after verifying your address later.
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
            {purchasedOrder && (
              <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400">
                Invite bought. Your codes are on their way to{" "}
                <span className="font-medium">{email}</span> &mdash; you can follow the order at{" "}
                <a
                  href={`/invites/purchased/${purchasedOrder}`}
                  className="underline underline-offset-2 hover:text-emerald-300"
                >
                  this link
                </a>
                . Paste a code below to finish registering.
              </div>
            )}
          {error && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}

          <SsoProviderButtons
            mode="signup"
            invite={inviteCode.trim() || undefined}
            dividerLabel="or register with email"
          />

          <PocketBaseLoginButton mode="signup" invite={inviteCode.trim() || undefined} />

          <EnterpriseSsoButtons mode="signup" />

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
            {/*
              Both ways in are named, and both are offered. The store trigger only
              renders when invites are actually for sale, so this cannot advertise a
              closed store.
            */}
            <p className="mt-1.5 text-xs text-zinc-500">
              Registration is invite-only. Get a code from an existing member, or{" "}
              {storeOpen ? (
                <>
                  <a href={inviteHref} className="text-violet-400 transition-colors hover:text-violet-300">
                    buy one here
                  </a>
                  <span className="mx-2" aria-hidden>
                    &middot;
                  </span>
                </>
              ) : null}
            </p>
            {storeOpen ? (
              <div className="mt-2">
                <BuyInviteModal email={email} onPurchased={onInvitePurchased} />
              </div>
            ) : null}
          </div>

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

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-zinc-300 mb-1.5">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              value={password}
              maxLength={128}
              onChange={(e) => {
                setPassword(e.target.value);
                clearFieldError("password");
              }}
              aria-invalid={Boolean(fieldErrors.password)}
              aria-describedby={fieldErrors.password ? "password-error" : undefined}
              className={`w-full rounded-lg border ${fieldErrors.password ? "border-red-500/70" : "border-zinc-800"} bg-zinc-900/50 px-4 py-2.5 text-sm text-white placeholder-zinc-500 outline-none transition-colors focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30`}
              placeholder="Min. 8 characters"
            />
            {fieldErrors.password && <p id="password-error" className="mt-1.5 text-xs text-red-400">{fieldErrors.password}</p>}
          </div>

          <CaptchaWidget
            onToken={setCaptchaToken}
            onEnabledChange={setCaptchaEnabled}
            resetKey={captchaNonce}
          />

          <div className="space-y-3">
            <label
              className={`flex items-start gap-2.5 cursor-pointer rounded-lg border px-3.5 py-3 transition-colors ${
                fieldErrors.acceptedPolicies
                  ? "border-red-500/50 bg-red-500/5"
                  : acceptedPolicies
                  ? "border-violet-500/40 bg-violet-500/5"
                  : "border-zinc-800 bg-zinc-900/40"
              }`}
            >
              <input
                type="checkbox"
                checked={acceptedPolicies}
                onChange={(e) => {
                  setAcceptedPolicies(e.target.checked);
                  if (e.target.checked) clearFieldError("acceptedPolicies");
                }}
                aria-invalid={Boolean(fieldErrors.acceptedPolicies)}
                className="mt-0.5 accent-violet-500"
              />
              <span className="text-sm text-zinc-300 leading-relaxed">
                I have read and agree to the{" "}
                <Link
                  to="/terms"
                  target="_blank"
                  className="text-violet-400 underline underline-offset-2 hover:text-violet-300"
                >
                  Terms of Service
                </Link>{" "}
                and{" "}
                <Link
                  to="/privacy"
                  target="_blank"
                  className="text-violet-400 underline underline-offset-2 hover:text-violet-300"
                >
                  Privacy Policy
                </Link>
                .
              </span>
            </label>
            {fieldErrors.acceptedPolicies && (
              <p id="acceptedPolicies-error" className="text-xs text-red-400">
                {fieldErrors.acceptedPolicies}
              </p>
            )}

            <label className="flex items-start gap-2.5 cursor-pointer rounded-lg border border-zinc-800 bg-zinc-900/40 px-3.5 py-3 transition-colors hover:border-zinc-700">
              <input
                type="checkbox"
                checked={newsletterOptIn}
                onChange={(e) => setNewsletterOptIn(e.target.checked)}
                className="mt-0.5 accent-violet-500"
              />
              <span className="text-sm text-zinc-400 leading-relaxed">
                Subscribe to occasional news and product announcements from {branding.name}. You can unsubscribe at any time
                from your account settings.
              </span>
            </label>
          </div>

          <Button type="submit" className="w-full h-11" disabled={loading || (captchaEnabled && !captchaToken)}>
            {loading ? "Creating account..." : "Create account"}
          </Button>
        </form>
        )}

        <p className="mt-6 text-center text-sm text-zinc-500">
          Already have an account?{" "}
          <Link to="/login" className="text-violet-400 hover:text-violet-300 transition-colors font-medium">
            Sign in
          </Link>
        </p>
      </div>
      </div>
      <AppFooter />
    </div>
  );
}
