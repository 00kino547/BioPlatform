import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, type Profile, type ProfileDomain } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Globe, ShieldCheck, ShieldAlert, CheckCircle2, RefreshCw, Trash2, Loader2, Lock } from "lucide-react";

const HOSTNAME_RE = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

function statusBadge(status: ProfileDomain["status"]) {
  switch (status) {
    case "PENDING_VERIFICATION":
      return { label: "Pending verification", className: "bg-amber-500/10 text-amber-400 border-amber-500/30" };
    case "VERIFIED":
      return { label: "Verified · awaiting approval", className: "bg-blue-500/10 text-blue-400 border-blue-500/30" };
    case "ACTIVE":
      return { label: "Active", className: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" };
    case "REJECTED":
      return { label: "Rejected", className: "bg-red-500/10 text-red-400 border-red-500/30" };
  }
}

export function DomainTab({ profileId, profiles }: { profileId?: string; profiles: Profile[] }) {
  const { user } = useAuth();
  const [domain, setDomain] = useState<ProfileDomain | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [rootTarget, setRootTarget] = useState("");

  const tier = user?.tier ?? "FREE";
  const hasAccess = tier === "PRO" || tier === "ENTERPRISE";

  const load = useCallback(async () => {
    if (!profileId) return;
    const res = await api.getProfileDomain(profileId);
    if (res.success) {
      setDomain(res.data ?? null);
      setRootTarget(res.data?.rootTarget ?? "");
    } else {
      setError(res.error ?? "Could not load domain settings");
    }
    setLoading(false);
  }, [profileId]);

  useEffect(() => {
    load();
  }, [load]);

  const submitRequest = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!profileId) return;
    setError("");
    setMessage("");
    const value = input.trim().toLowerCase();
    if (!HOSTNAME_RE.test(value) || value.startsWith("www.")) {
      setError("Enter a plain hostname like example.com (no scheme, path, port, or www).");
      return;
    }
    setBusy(true);
    const res = await api.requestProfileDomain(profileId, value);
    setBusy(false);
    if (!res.success) {
      setError(res.error ?? "Could not request domain");
      return;
    }
    setDomain(res.data ?? null);
    setInput("");
  };

  const handleVerify = async () => {
    if (!profileId) return;
    setError("");
    setMessage("");
    setVerifying(true);
    const res = await api.verifyProfileDomain(profileId);
    setVerifying(false);
    if (!res.success) {
      setError(res.error ?? "Verification failed");
      return;
    }
    setDomain(res.data ?? null);
    setMessage("Domain verified! An admin will review and activate it.");
    setTimeout(() => setMessage(""), 4000);
  };

  const handleRoot = async (target: string) => {
    if (!profileId) return;
    setError("");
    const res = await api.setProfileDomainRoot(profileId, target || null);
    if (!res.success) {
      setError(res.error ?? "Could not update root target");
      return;
    }
    setDomain(res.data ?? null);
    setRootTarget(res.data?.rootTarget ?? "");
    setMessage("Root behavior updated.");
    setTimeout(() => setMessage(""), 2500);
  };

  const handleRemove = async () => {
    if (!profileId) return;
    setError("");
    const res = await api.removeProfileDomain(profileId);
    if (!res.success) {
      setError(res.error ?? "Could not remove domain");
      return;
    }
    setDomain(null);
    setRootTarget("");
  };

  if (loading) {
    return <p className="text-sm text-zinc-500 text-center py-12">Loading domain settings…</p>;
  }

  if (!hasAccess) {
    return (
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/30 p-8 sm:p-10 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-zinc-700 bg-zinc-800/60 mb-4">
          <Lock className="h-6 w-6 text-violet-400" />
        </div>
        <h3 className="text-lg font-semibold text-white">Custom domains require a PRO or Enterprise tier</h3>
        <p className="mt-2 text-sm text-zinc-400 max-w-md mx-auto">
          Upgrade your account and have an admin grant your role the <code className="text-zinc-300">profiles.customDomain</code> permission to use your own domain.
        </p>
      </div>
    );
  }

  const publicProfiles = profiles.filter((p) => p.isPublic);

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">{error}</div>
      )}
      {message && (
        <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-4 py-3 text-sm text-emerald-400">{message}</div>
      )}

      {!domain && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-5">
          <div className="flex items-center gap-3 mb-4">
            <Globe className="h-5 w-5 text-violet-400" />
            <div>
              <h3 className="text-sm font-medium text-white">Connect a custom domain</h3>
              <p className="text-xs text-zinc-500">
                Use your own domain, like example.com. We'll give you a TXT record to prove you own it.
              </p>
            </div>
          </div>
          <form onSubmit={submitRequest} className="flex flex-col sm:flex-row gap-3">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="example.com"
              className="flex-1 rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
            <Button type="submit" disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Request domain
            </Button>
          </form>
        </div>
      )}

      {domain && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-5">
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <Globe className="h-5 w-5 text-violet-400" />
            <span className="text-sm font-semibold text-white">{domain.domain}</span>
            <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${statusBadge(domain.status).className}`}>
              {statusBadge(domain.status).label}
            </span>
          </div>

          {domain.status === "PENDING_VERIFICATION" && (
            <div className="space-y-4">
              <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-4 space-y-3">
                <p className="text-xs text-zinc-400">
                  Add a <span className="text-zinc-200">TXT record</span> to your DNS provider, then click verify below. DNS can take a few minutes to propagate.
                </p>
                <div>
                  <p className="text-xs text-zinc-500 mb-1">Record name (host)</p>
                  <code className="block rounded bg-zinc-800/70 px-3 py-2 text-xs text-emerald-400 break-all">_bioplatform.{domain.domain}</code>
                </div>
                <div>
                  <p className="text-xs text-zinc-500 mb-1">Value</p>
                  <code className="block rounded bg-zinc-800/70 px-3 py-2 text-xs text-emerald-400 break-all">{domain.verificationToken}</code>
                </div>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button onClick={handleVerify} disabled={verifying}>
                  {verifying ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  {verifying ? "Checking DNS…" : "I've added the record — Verify now"}
                </Button>
                <Button variant="ghost" onClick={handleRemove}>
                  <Trash2 className="h-4 w-4" /> Remove request
                </Button>
              </div>
            </div>
          )}

          {domain.status === "VERIFIED" && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 rounded-lg border border-blue-500/30 bg-blue-500/10 p-4">
                <ShieldCheck className="h-5 w-5 text-blue-400 shrink-0 mt-0.5" />
                <p className="text-sm text-zinc-300">
                  Your TXT record was verified. An admin will now review and activate your domain — you'll see it go live here.
                </p>
              </div>
              <Button variant="ghost" onClick={handleRemove}>
                <Trash2 className="h-4 w-4" /> Remove request
              </Button>
            </div>
          )}

          {domain.status === "ACTIVE" && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4">
                <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />
                <p className="text-sm text-zinc-300">
                  Your custom domain is live at <span className="text-white font-medium">https://{domain.domain}</span>. Once DNS/SSL are configured, visitors will be redirected here.
                </p>
              </div>
              {domain.tlsStatus === "ISSUED" && (
                <div className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-400">
                  <ShieldCheck className="h-4 w-4 shrink-0" />
                  <span>
                    HTTPS certificate active
                    {domain.tlsExpiresAt ? ` · renews ${new Date(domain.tlsExpiresAt).toLocaleDateString()}` : ""}.
                  </span>
                </div>
              )}
              {domain.tlsStatus === "PENDING" && (
                <div className="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-400">
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                  <span>HTTPS certificate is being issued…</span>
                </div>
              )}
              {domain.tlsStatus === "FAILED" && (
                <div className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-400">
                  <ShieldAlert className="h-4 w-4 shrink-0" />
                  <span>
                    Automatic HTTPS failed{domain.tlsError ? `: ${domain.tlsError}` : ""}. Contact an admin to check DNS and port 80.
                  </span>
                </div>
              )}
              <div>
                <p className="text-xs text-zinc-500 mb-2">Root of your domain (https://{domain.domain}/)</p>
                <select
                  value={rootTarget}
                  onChange={(e) => handleRoot(e.target.value)}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                >
                  <option value="">Landing page</option>
                  {publicProfiles.map((p) => (
                    <option key={p.id} value={p.slug}>
                      Profile “{p.displayName || p.slug}” ({p.slug})
                    </option>
                  ))}
                </select>
                <p className="text-xs text-zinc-500 mt-2">
                  {rootTarget ? `Landing at the root shows the profile ${rootTarget}.` : "Landing at the root shows the landing page; your profile stays at /" + profiles.find((p) => p.id === profileId)?.slug + "."}
                </p>
              </div>
              <Button variant="ghost" onClick={handleRemove}>
                <Trash2 className="h-4 w-4" /> Disconnect domain
              </Button>
            </div>
          )}

          {domain.status === "REJECTED" && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 rounded-lg border border-red-500/30 bg-red-500/10 p-4">
                <ShieldAlert className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
                <p className="text-sm text-zinc-300">
                  This domain request was rejected. You can submit a new request with a different domain.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-3">
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="example.com"
                  className="flex-1 rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
                <Button onClick={submitRequest} disabled={busy}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Request new domain
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
