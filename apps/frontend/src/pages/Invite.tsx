import { useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { Gift, UserPlus, ExternalLink } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { branding } from "@/config/branding";
import { usePageMeta } from "@/lib/seo";
import { api, type InviteInfo } from "@/lib/api";
import { avatarSrcSet, mediaUrl } from "@/lib/media";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/landing/Footer";

export function Invite() {
  const { code = "" } = useParams();
  const { user, loading } = useAuth();

  usePageMeta({
    title: `Join ${branding.name}`,
    description: `You've been invited to join ${branding.name}. Create your profile and start sharing your links.`,
    url: `/invite/${code}`,
  });

  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [status, setStatus] = useState<"loading" | "ok" | "notfound">("loading");

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setInvite(null);
    api.getInvite(code).then((res) => {
      if (cancelled) return;
      if (res.success && res.data) {
        setInvite(res.data);
        setStatus("ok");
      } else {
        setStatus("notfound");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [code]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-700 border-t-violet-500" />
      </div>
    );
  }

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  const discountActive = (invite?.inviteeDiscountPercent ?? 0) > 0;
  const durationLabel =
    (invite?.discountDurationDays ?? 0) < 0
      ? "permanent"
      : invite?.discountDurationDays === 365
        ? "your first year"
        : `${invite?.discountDurationDays ?? 365} days`;

  return (
    <>
      <Navbar />
      <main className="min-h-[80vh] flex items-center justify-center px-4 py-16">
        <div className="w-full max-w-md">
          <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/30 backdrop-blur p-7 sm:p-8 space-y-6">
            {status === "loading" && (
              <div className="h-24 flex items-center justify-center">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-700 border-t-violet-500" />
              </div>
            )}

            {status === "notfound" && (
              <div className="space-y-4 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-zinc-800 bg-zinc-900/60">
                  <ExternalLink className="h-5 w-5 text-zinc-500" />
                </div>
                <div className="space-y-1.5">
                  <h1 className="text-lg font-semibold text-white">This page doesn&apos;t exist</h1>
                  <p className="text-sm text-zinc-400">
                    The invite link is invalid or has already been used.
                  </p>
                </div>
                <Button href="/" variant="outline" size="lg" className="w-full">
                  Back to {branding.name}
                </Button>
              </div>
            )}

            {status === "ok" && invite && (
              <>
                <div className="text-center space-y-1.5">
                  <div className="mx-auto inline-flex items-center gap-1.5 rounded-full border border-violet-500/30 bg-violet-500/10 px-3 py-1 text-xs font-medium text-violet-300">
                    <Gift className="h-3.5 w-3.5" />
                    Invitation
                  </div>
                  <p className="text-sm text-zinc-400">
                    You&apos;ve been invited to join <span className="text-white font-medium">{branding.name}</span>
                  </p>
                </div>

                {invite.referrer && (
                  <div className="flex items-center gap-4 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
                    {invite.referrer.avatar ? (
                      <img
                        src={mediaUrl(invite.referrer.avatar, { w: 96 })}
                        srcSet={avatarSrcSet(invite.referrer.avatar)}
                        alt=""
                        className="h-14 w-14 rounded-full object-cover ring-2 ring-zinc-700"
                      />
                    ) : (
                      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-zinc-800 text-lg font-semibold text-violet-400 ring-2 ring-zinc-700">
                        {(invite.referrer.displayName ?? invite.referrer.username).slice(0, 1).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-white">
                        {invite.referrer.displayName ?? invite.referrer.username}
                      </p>
                      <Link
                        to={`/${invite.referrer.slug}`}
                        className="text-sm text-zinc-400 hover:text-violet-300 transition-colors"
                      >
                        @{invite.referrer.username}
                      </Link>
                    </div>
                  </div>
                )}

                {discountActive && (
                  <div className="rounded-xl border border-violet-500/30 bg-violet-500/10 p-4 text-center space-y-1">
                    <p className="text-2xl font-bold text-white">
                      {invite.inviteeDiscountPercent}% off
                    </p>
                    <p className="text-sm text-zinc-300">
                      on every plan, for {durationLabel}
                    </p>
                  </div>
                )}

                <div className="space-y-3">
                  <Button
                    href={`/register?invite=${encodeURIComponent(invite.code)}`}
                    size="lg"
                    className="w-full"
                  >
                    <UserPlus className="h-4 w-4" />
                    Create your account with this invite
                  </Button>
                  <p className="text-center text-xs text-zinc-500">
                    Invite codes are single-use. Registration is invite-only.
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}