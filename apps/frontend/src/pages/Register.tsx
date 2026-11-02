import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Trans, useTranslation } from "react-i18next";
import { Mail as MailIcon } from "lucide-react";
import { useAuth } from "@/contexts/useAuth";
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
  const { t } = useTranslation("auth");
  const { register } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  usePageMeta({ title: t("register.metaTitle"), description: t("register.metaDescription", { name: branding.name }), url: "/register" });
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
    if (!username) errors.username = t("register.usernameRequired");
    else if (username.length < 3) errors.username = t("register.usernameMin");
    else if (username.length > 32) errors.username = t("register.usernameMax");
    else if (!/^[a-z0-9_-]+$/.test(username)) {
      errors.username = t("register.usernameInvalid");
    }

    if (!email.trim()) errors.email = t("register.emailRequired");
    else if (email.length > 254) errors.email = t("register.emailMax");
    else if (!/^\S+@\S+\.\S+$/.test(email.trim())) errors.email = t("register.emailInvalid");

    if (!password) errors.password = t("register.passwordRequired");
    else if (password.length < 8) errors.password = t("register.passwordMin");
    else if (password.length > 128) errors.password = t("register.passwordMax");

    if (!inviteCode.trim()) errors.inviteCode = t("register.inviteCodeRequired");
    else if (inviteCode.length > 128) errors.inviteCode = t("register.inviteCodeMax");

    if (!acceptedPolicies) errors.acceptedPolicies = t("register.policiesRequired");
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
      setError(result.error ?? t("register.fixFields"));
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
          <p className="mt-2 text-sm text-zinc-400">{t("register.subtitle")}</p>
        </div>

        {verificationPending ? (
          <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/30 p-7 sm:p-8 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-violet-500/10 border border-violet-500/30">
              <MailIcon className="h-6 w-6 text-violet-400" />
            </div>
            <h1 className="text-lg font-semibold text-white">{t("register.checkEmailTitle")}</h1>
            {/* register.checkEmailBody uses the <Trans> tag form so the email keeps its styled span. */}
            <p className="mt-2 text-sm text-zinc-400 leading-relaxed">
              <Trans
                i18nKey="register.checkEmailBody"
                ns="auth"
                values={{ email }}
                components={[<span key="email" className="text-zinc-200 font-medium" />]}
              />
            </p>
            {verificationEmailSent === false && (
              <p className="mt-3 text-xs text-amber-400/90">
                {t("register.emailNotConfigured", { name: branding.name })}
              </p>
            )}
            <Link to="/login" className="mt-6 inline-block w-full">
              <Button className="w-full h-11">{t("register.goToSignIn")}</Button>
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
                {/* register.inviteBought uses the <Trans> tag form so the email span and the
                    order link keep their styling. */}
                <Trans
                  i18nKey="register.inviteBought"
                  ns="auth"
                  values={{ email }}
                  components={[
                    <span key="email" className="font-medium" />,
                    <a
                      key="order"
                      href={`/invites/purchased/${purchasedOrder}`}
                      className="underline underline-offset-2 hover:text-emerald-300"
                    />,
                  ]}
                />
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
            dividerLabel={t("register.registerWithEmail")}
          />

          <PocketBaseLoginButton mode="signup" invite={inviteCode.trim() || undefined} />

          <EnterpriseSsoButtons mode="signup" />

          <div>
            <label htmlFor="inviteCode" className="block text-sm font-medium text-zinc-300 mb-1.5">
              {t("register.inviteCodeLabel")}
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
              placeholder={t("register.inviteCodePlaceholder")}
            />
            {fieldErrors.inviteCode && <p id="inviteCode-error" className="mt-1.5 text-xs text-red-400">{fieldErrors.inviteCode}</p>}
            {/*
              Both ways in are named, and both are offered. The store trigger only
              renders when invites are actually for sale, so this cannot advertise a
              closed store.
            */}
            <p className="mt-1.5 text-xs text-zinc-500">
              {t("register.inviteOnlyHint")}
              {storeOpen ? (
                <>
                  <a href={inviteHref} className="text-violet-400 transition-colors hover:text-violet-300">
                    {t("register.buyOneHere")}
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
              {t("register.usernameLabel")}
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
              placeholder={t("register.usernamePlaceholder")}
              minLength={3}
              maxLength={32}
              pattern="[a-z0-9_-]+"
            />
            {fieldErrors.username && <p id="username-error" className="mt-1.5 text-xs text-red-400">{fieldErrors.username}</p>}
            {/* register.profileWillBeAt uses the <Trans> tag form so the username keeps its styled span. */}
            <p className="mt-1.5 text-xs text-zinc-500">
              <Trans
                i18nKey="register.profileWillBeAt"
                ns="auth"
                values={{ host: new URL(branding.url).host, username: username || "username" }}
                components={[<span key="username" className="text-zinc-400" />]}
              />
            </p>
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-zinc-300 mb-1.5">
              {t("register.emailLabel")}
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
              placeholder={t("register.emailPlaceholder")}
            />
            {fieldErrors.email && <p id="email-error" className="mt-1.5 text-xs text-red-400">{fieldErrors.email}</p>}
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-zinc-300 mb-1.5">
              {t("register.passwordLabel")}
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
              placeholder={t("register.passwordPlaceholder")}
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
                {/* register.agreePolicies uses the <Trans> tag form so the Terms and Privacy
                    links keep pointing at their real routes. */}
                <Trans
                  i18nKey="register.agreePolicies"
                  ns="auth"
                  components={[
                    <Link
                      key="terms"
                      to="/terms"
                      target="_blank"
                      className="text-violet-400 underline underline-offset-2 hover:text-violet-300"
                    />,
                    <Link
                      key="privacy"
                      to="/privacy"
                      target="_blank"
                      className="text-violet-400 underline underline-offset-2 hover:text-violet-300"
                    />,
                  ]}
                />
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
                {t("register.newsletterOptIn", { name: branding.name })}
              </span>
            </label>
          </div>

          <Button type="submit" className="w-full h-11" disabled={loading || (captchaEnabled && !captchaToken)}>
            {loading ? t("register.creatingAccount") : t("register.createAccount")}
          </Button>
        </form>
        )}

        <p className="mt-6 text-center text-sm text-zinc-500">
          {t("register.alreadyHaveAccount")}{" "}
          <Link to="/login" className="text-violet-400 hover:text-violet-300 transition-colors font-medium">
            {t("register.signInLink")}
          </Link>
        </p>
      </div>
      </div>
      <AppFooter />
    </div>
  );
}
