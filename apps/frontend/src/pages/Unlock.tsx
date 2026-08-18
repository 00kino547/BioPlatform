import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { branding } from "@/config/branding";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { usePageMeta } from "@/lib/seo";
import { AppFooter } from "@/components/layout/AppFooter";

export function Unlock() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [status, setStatus] = useState<"verifying" | "success" | "error">("verifying");
  const [error, setError] = useState("");

  usePageMeta({ title: "Unlock Account", description: `Unlock your ${branding.name} account.`, url: "/unlock" });

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setError("Missing unlock token.");
      return;
    }

    api
      .verifyUnlock(token)
      .then((res) => {
        if (res.success) {
          setStatus("success");
        } else {
          setStatus("error");
          setError(res.error ?? "Unable to unlock your account.");
        }
      })
      .catch(() => {
        setStatus("error");
        setError("Unable to unlock your account.");
      });
  }, [token]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="flex-1 flex items-center justify-center px-4">
      <div className="w-full max-w-md text-center">
        <div className="mb-8">
          <Link to="/" className="text-2xl font-bold text-white tracking-tight">
            {branding.name}
          </Link>
          <p className="mt-2 text-sm text-zinc-400">Account unlock</p>
        </div>

        <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/30 p-8">
          {status === "verifying" && (
            <div className="flex flex-col items-center gap-4">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-700 border-t-violet-500" />
              <p className="text-sm text-zinc-400">Verifying your unlock link…</p>
            </div>
          )}

          {status === "success" && (
            <div className="space-y-4">
              <h1 className="text-lg font-semibold text-white">Your account has been unlocked</h1>
              <p className="text-sm text-zinc-400">
                You can now sign in again with your username or email and password.
              </p>
              <Link to="/login">
                <Button className="w-full h-11">Go to Sign In</Button>
              </Link>
            </div>
          )}

          {status === "error" && (
            <div className="space-y-4">
              <h1 className="text-lg font-semibold text-white">Unable to unlock</h1>
              <p className="text-sm text-red-400">{error}</p>
              <Link to="/login">
                <Button variant="secondary" className="w-full h-11">
                  Back to Sign In
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
