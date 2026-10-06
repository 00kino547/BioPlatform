import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";
import { branding } from "@/config/branding";

/**
 * Deemed-acceptance gate for the Terms of Service and Privacy Policy.
 *
 * The backend refuses every authenticated request with `403 policies_outdated`
 * until the account accepts the current policy versions (see
 * `apps/backend/src/middleware/consent.ts`). This component is the matching
 * front end: while `user.consent.current` is false it replaces the whole app
 * with an acceptance screen, so the user cannot click through into a dashboard
 * whose requests would all fail.
 *
 * A user can be released automatically without ever seeing this screen: the
 * backend deems acceptance after 30 days of continued use from the effective
 * date, and `GET /auth/me` then reports `current: true`.
 *
 * The legal documents themselves are exempt. Replacing the whole app would make
 * them unreachable, because the links below open in a new tab — that new tab
 * loads the app on /terms or /privacy, where this gate would again cover the
 * very document it is asking the user to read. So on those two routes the gate
 * steps aside and renders the real page.
 */
/** Routes that must stay readable while the account is blocked by consent. */
const LEGAL_ROUTES = ["/terms", "/privacy"];

export function ConsentGate({ children }: { children: React.ReactNode }) {
  const { user, loading, refreshUser, logout } = useAuth();
  const { pathname } = useLocation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Only signed-in accounts can be out of date; anonymous visitors are unaffected.
  if (loading || !user || user.consent?.current !== false) {
    return <>{children}</>;
  }

  // Let the user read what they are being asked to accept. The account is still
  // locked: every authenticated API call answers 403 policies_outdated until they
  // return here and accept.
  if (LEGAL_ROUTES.some((route) => pathname === route || pathname === `${route}/`)) {
    return <>{children}</>;
  }

  const behind = user.consent.behind;
  const documents = [
    behind.tos ? { label: "Terms of Service", href: "/terms" } : null,
    behind.privacy ? { label: "Privacy Policy", href: "/privacy" } : null,
  ].filter((d): d is { label: string; href: string } => d !== null);

  const accept = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api.acceptPolicies();
      if (!res.success) {
        setError(res.error ?? "Could not record your acceptance");
        return;
      }
      // Re-read the account so `consent.current` flips and the gate releases.
      await refreshUser();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0b0b0f] text-zinc-100 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-white/[0.03] p-8 shadow-2xl">
        <h1 className="text-xl font-semibold text-white">Our legal documents have changed</h1>

        <p className="mt-4 text-sm leading-relaxed text-zinc-400">
          To keep using {branding.name}, please review and accept the updated{" "}
          {documents.length > 1 ? "documents" : "document"}. Nothing about your account,
          profile or content changes.
        </p>

        <ul className="mt-4 space-y-2">
          {documents.map((doc) => (
            <li key={doc.href}>
              <Link
                to={doc.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-violet-400 hover:text-violet-300 transition-colors underline underline-offset-4"
              >
                Read the updated {doc.label}
              </Link>
            </li>
          ))}
        </ul>

        {error ? (
          <p role="alert" className="mt-4 text-sm text-red-400">
            {error}
          </p>
        ) : null}

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={accept}
            disabled={busy}
            className="rounded-lg bg-violet-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-violet-500 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {busy ? "Saving…" : "I accept"}
          </button>
          <button
            type="button"
            onClick={logout}
            disabled={busy}
            className="text-sm text-zinc-500 transition-colors hover:text-zinc-300 disabled:opacity-60"
          >
            Sign out
          </button>
        </div>

        <p className="mt-6 text-xs text-zinc-600">
          Version {user.consent.versions.tos} · {formatDate(user.consent.versions.tos)}
        </p>
      </div>
    </div>
  );
}

/** Renders an ISO date as e.g. "30 September 2026". */
function formatDate(iso: string): string {
  const parsed = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}
