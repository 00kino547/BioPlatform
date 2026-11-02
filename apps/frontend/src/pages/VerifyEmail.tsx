import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { branding } from "@/config/branding";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { usePageMeta } from "@/lib/seo";
import { AppFooter } from "@/components/layout/AppFooter";

// A3b — confirms the account's email from the signed `?token=` link created by
// the register / verify-email/send flows. Success unlocks login for the account.
export function VerifyEmail() {
  const { t } = useTranslation("auth");
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [status, setStatus] = useState<"verifying" | "success" | "error">("verifying");
  const [error, setError] = useState("");

  usePageMeta({ title: t("verifyEmail.metaTitle"), description: t("verifyEmail.metaDescription", { name: branding.name }), url: "/verify-email" });

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setError(t("verifyEmail.missingToken"));
      return;
    }

    api
      .verifyEmail(token)
      .then((res) => {
        if (res.success) {
          setStatus("success");
        } else {
          setStatus("error");
          setError(res.error ?? t("verifyEmail.unable"));
        }
      })
      .catch(() => {
        setStatus("error");
        setError(t("verifyEmail.unable"));
      });
  }, [token, t]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="w-full max-w-md text-center">
          <div className="mb-8">
            <Link to="/" className="text-2xl font-bold text-white tracking-tight">
              {branding.name}
            </Link>
            <p className="mt-2 text-sm text-zinc-400">{t("verifyEmail.subtitle")}</p>
          </div>

          <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/30 p-8">
            {status === "verifying" && (
              <div className="flex flex-col items-center gap-4">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-700 border-t-violet-500" />
                <p className="text-sm text-zinc-400">{t("verifyEmail.verifying")}</p>
              </div>
            )}

            {status === "success" && (
              <div className="space-y-4">
                <h1 className="text-lg font-semibold text-white">{t("verifyEmail.successTitle")}</h1>
                <p className="text-sm text-zinc-400">{t("verifyEmail.successBody")}</p>
                <Link to="/login">
                  <Button className="w-full h-11">{t("verifyEmail.goToSignIn")}</Button>
                </Link>
              </div>
            )}

            {status === "error" && (
              <div className="space-y-4">
                <h1 className="text-lg font-semibold text-white">{t("verifyEmail.errorTitle")}</h1>
                <p className="text-sm text-red-400">{error}</p>
                <p className="text-xs text-zinc-500">{t("verifyEmail.expiredHint")}</p>
                <Link to="/login">
                  <Button variant="secondary" className="w-full h-11">
                    {t("verifyEmail.backToSignIn")}
                  </Button>
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
      <AppFooter />
    </div>
  );
}