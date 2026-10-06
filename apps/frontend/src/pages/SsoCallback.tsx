import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { branding } from "@/config/branding";
import { api } from "@/lib/api";
import { OAUTH_TF_KEY } from "@/lib/oauthStorage";
import { usePageMeta } from "@/lib/seo";
import { AppFooter } from "@/components/layout/AppFooter";

export function SsoCallback() {
  const { user, setAuth } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [error, setError] = useState("");

  useEffect(() => {
    const errorParam = searchParams.get("error");
    if (errorParam) {
      setError(errorParam);
      return;
    }

    if (searchParams.get("status") === "linked") {
      navigate("/dashboard", { replace: true });
      return;
    }

    const code = searchParams.get("code");
    if (!code) {
      setError("This sign-in link is missing a code.");
      return;
    }

    api.ssoEnterpriseExchange(code).then((res) => {
      if (!res.success || !res.data) {
        setError(res.error ?? "Sign-in failed");
        return;
      }

      if (res.data.status === "logged_in") {
        setAuth(res.data.token, res.data.user);
        navigate("/dashboard", { replace: true });
        return;
      }

      if (res.data.status === "needs_two_factor") {
        sessionStorage.setItem(
          OAUTH_TF_KEY,
          JSON.stringify({ methods: res.data.methods, twoFactorToken: res.data.twoFactorToken })
        );
        navigate("/login?tf=1", { replace: true });
      }
    });
  }, [searchParams, setAuth, navigate]);

  usePageMeta({ title: "Signing In", description: `Completing your sign-in to ${branding.name}.` });

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="w-full max-w-md text-center">
          <Link to="/" className="text-2xl font-bold text-white tracking-tight">
            {branding.name}
          </Link>
          <div className="mt-8 rounded-2xl border border-zinc-800/80 bg-zinc-900/30 p-7 sm:p-8">
            {error ? (
              <div className="space-y-3">
                <p className="text-sm text-red-400">{error}</p>
                <Link
                  to={user ? "/dashboard" : "/login"}
                  className="text-sm text-violet-400 hover:text-violet-300 transition-colors font-medium"
                >
                  {user ? "Back to dashboard" : "Back to sign in"}
                </Link>
              </div>
            ) : (
              <p className="text-sm text-zinc-400">Completing sign-in...</p>
            )}
          </div>
        </div>
      </div>
      <AppFooter />
    </div>
  );
}