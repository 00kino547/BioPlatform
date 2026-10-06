import { useCallback, useEffect, useState } from "react";
import { api, type NewsletterConfig, type NewsletterSubscriber, type NewsletterTierConfig, type NewsletterWhitelistUser } from "@/lib/api";
import { Pagination } from "./Pagination";
import { Loader2, Mail, Megaphone, RotateCcw, Save, Search, ShieldCheck, UserCheck, UserX } from "lucide-react";

type TierName = "FREE" | "PRO" | "ENTERPRISE";

const TIERS: TierName[] = ["FREE", "PRO", "ENTERPRISE"];

const inputClass =
  "w-full rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-violet-500";

export function AdminNewsletterTab() {
  const [config, setConfig] = useState<NewsletterConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [draft, setDraft] = useState<NewsletterTierConfig | null>(null);

  const [searchEmail, setSearchEmail] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<{
    account?: {
      exists: boolean;
      username?: string;
      announcementsOptIn?: boolean;
      announcementsOptInAt?: string | null;
      announcementsUnsubscribedAt?: string | null;
      acceptedPoliciesAt?: string | null;
    };
    consentEvents: { at: string; ip: string; userAgent: string; profileId: string }[];
    subscriptions: (NewsletterSubscriber & { profileId: string; status: "subscribed" | "unsubscribed" })[];
  } | null>(null);
  const [searchError, setSearchError] = useState("");

  const [wlQuery, setWlQuery] = useState("");
  const [wlUsers, setWlUsers] = useState<NewsletterWhitelistUser[]>([]);
  const [wlTotal, setWlTotal] = useState(0);
  const [wlPage, setWlPage] = useState(0);
  const [wlLoading, setWlLoading] = useState(false);
  const [wlToggling, setWlToggling] = useState<string | null>(null);
  const [wlError, setWlError] = useState("");

  const syncDraft = useCallback((c: NewsletterTierConfig) => {
    setDraft({
      FREE: { ...c.FREE },
      PRO: { ...c.PRO },
      ENTERPRISE: { ...c.ENTERPRISE },
    });
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await api.getNewsletterConfig();
      if (res.success && res.data) {
        setConfig(res.data);
        syncDraft(res.data.config);
        setError("");
      } else {
        setError(res.error ?? "Could not load newsletter config");
      }
    } catch {
      setError("Could not load newsletter config");
    }
    setLoading(false);
  }, [syncDraft]);

  useEffect(() => {
    load();
  }, [load]);

  const dirty = !draft || !config
    ? false
    : JSON.stringify(draft) !== JSON.stringify(config.config);

  const patchTier = (tier: TierName, key: "sendLimit" | "windowHours", value: string) => {
    setDraft((d) => {
      if (!d) return d;
      const num = value === "" ? 0 : Number(value);
      return { ...d, [tier]: { ...d[tier], [key]: Number.isFinite(num) ? num : 0 } };
    });
  };

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    setError("");
    try {
      const res = await api.updateNewsletterConfig(draft);
      if (res.success && res.data) {
        setConfig(res.data);
        syncDraft(res.data.config);
      } else {
        setError(res.error ?? "Could not save newsletter config");
      }
    } catch {
      setError("Could not save newsletter config");
    }
    setSaving(false);
  };

  const reset = async () => {
    if (!window.confirm("Reset newsletter tier limits to the built-in defaults (FREE 0, PRO 1, ENTERPRISE 5 per 24 h)?")) return;
    setResetting(true);
    setError("");
    try {
      const res = await api.resetNewsletterConfig();
      if (res.success && res.data) {
        setConfig(res.data);
        syncDraft(res.data.config);
      } else {
        setError(res.error ?? "Could not reset newsletter config");
      }
    } catch {
      setError("Could not reset newsletter config");
    }
    setResetting(false);
  };

  const searchConsent = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = searchEmail.trim().toLowerCase();
    if (!email) return;
    setSearching(true);
    setSearchError("");
    setSearchResult(null);
    const res = await api.searchNewsletterConsent(email);
    setSearching(false);
    if (!res.success || !res.data) {
      setSearchError(res.error ?? "Search failed");
      return;
    }
    setSearchResult(res.data);
  };

  const loadWhitelist = useCallback(async (page = 0) => {
    setWlLoading(true);
    setWlError("");
    const PAGE_SIZE = 10;
    const res = await api.getNewsletterSenderWhitelist(wlQuery.trim() || undefined, { limit: PAGE_SIZE, offset: page * PAGE_SIZE });
    if (res.success && res.data) {
      setWlUsers(res.data.users);
      if (res.meta) setWlTotal(res.meta.total);
    } else {
      setWlError(res.error ?? "Could not load the sender allowlist.");
    }
    setWlLoading(false);
  }, [wlQuery]);

  useEffect(() => {
    void loadWhitelist();
  }, [loadWhitelist]);

  const toggleWhitelist = async (u: NewsletterWhitelistUser) => {
    setWlToggling(u.id);
    setWlError("");
    const res = await api.setNewsletterSenderWhitelist(u.id, !u.whitelisted);
    if (res.success && res.data) {
      setWlUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, whitelisted: res.data!.whitelisted } : x)));
    } else {
      setWlError(res.error ?? "Could not update the sender allowlist.");
    }
    setWlToggling(null);
  };

  const [broadcastSubject, setBroadcastSubject] = useState("");
  const [broadcastBody, setBroadcastBody] = useState("");
  const [audienceCount, setAudienceCount] = useState<number | null>(null);
  const [broadcasting, setBroadcasting] = useState(false);
  const [broadcastNotice, setBroadcastNotice] = useState("");
  const [broadcasts, setBroadcasts] = useState<{ id: string; subject: string; recipientCount: number; successCount: number; sentAt: string }[]>([]);

  const loadBroadcast = useCallback(async () => {
    const [aud, list] = await Promise.all([api.getNewsletterBroadcastAudience(), api.getNewsletterBroadcasts()]);
    if (aud.success && aud.data) setAudienceCount(aud.data.count);
    if (list.success && list.data) setBroadcasts(list.data.broadcasts);
  }, []);

  useEffect(() => {
    void loadBroadcast();
  }, [loadBroadcast]);

  const sendBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!broadcastSubject.trim() || !broadcastBody.trim()) return;
    if (!window.confirm(`Send this announcement to ${audienceCount ?? 0} opted-in user(s)? This cannot be undone.`)) return;
    setBroadcasting(true);
    setBroadcastNotice("");
    try {
      const res = await api.sendNewsletterBroadcast({ subject: broadcastSubject.trim(), body: broadcastBody.trim() });
      if (res.success && res.data) {
        setBroadcastNotice(
          `Sent to ${res.data.recipientCount} recipient(s): ${res.data.successCount} delivered, ${res.data.failedCount} failed.`
        );
        setBroadcastSubject("");
        setBroadcastBody("");
        void loadBroadcast();
      } else {
        setBroadcastNotice(res.error ?? "Broadcast failed.");
      }
    } catch {
      setBroadcastNotice("Broadcast failed.");
    }
    setBroadcasting(false);
  };

  if (loading) {
    return <p className="text-sm text-zinc-500 text-center py-12">Loading newsletter configuration…</p>;
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/30 p-7 sm:p-8">
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-1">
            <Mail className="h-4 w-4 text-violet-400" />
            <h2 className="text-lg font-semibold text-white">Newsletter tier limits</h2>
          </div>
          <p className="text-sm text-zinc-500">
            How many newsletter sends each account tier may make per rolling window. Source:{" "}
            <span className="font-medium text-zinc-300">{config?.configSource === "db" ? "admin override" : "default"}</span>.
            Every send counts against the window. FREE defaults to 0 (sending disabled).
          </p>
        </div>

        {draft && (
          <div className="grid gap-4 sm:grid-cols-3">
            {TIERS.map((tier) => (
              <div key={tier} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
                <p className="text-sm font-semibold text-white mb-3">{tier}</p>
                <label className="block text-xs text-zinc-500 mb-1">Sends per window</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={draft[tier].sendLimit}
                  onChange={(e) => patchTier(tier, "sendLimit", e.target.value)}
                  className={`${inputClass} mb-3`}
                />
                <label className="block text-xs text-zinc-500 mb-1">Window (hours)</label>
                <input
                  type="number"
                  min={1}
                  max={8760}
                  value={draft[tier].windowHours}
                  onChange={(e) => patchTier(tier, "windowHours", e.target.value)}
                  className={inputClass}
                />
              </div>
            ))}
          </div>
        )}

        <div className="mt-6 flex gap-2.5">
          <button
            type="button"
            onClick={save}
            disabled={!draft || !dirty || saving}
            className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white shadow-lg shadow-violet-600/20 transition-all duration-200 hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? "Saving…" : dirty ? "Save Changes" : "Saved"}
          </button>
          <button
            type="button"
            onClick={reset}
            disabled={resetting}
            className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-100 transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RotateCcw className="h-4 w-4" />
            {resetting ? "Resetting…" : "Reset to Defaults"}
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/30 p-7 sm:p-8">
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-1">
            <ShieldCheck className="h-4 w-4 text-violet-400" />
            <h2 className="text-lg font-semibold text-white">Consent search</h2>
          </div>
          <p className="text-sm text-zinc-500">
            Verify a subscriber&apos;s consent (GDPR / CASL accountability). Permanent rows show the email, subscribe/unsubscribe
            status and policy versions agreed to; the account-level platform announcements opt-in/opt-out is shown separately.
            The IP + User-Agent captured at signup are kept transiently in memory for 24 h and never stored in the database.
          </p>
        </div>

        <form onSubmit={searchConsent} className="flex gap-2.5">
          <input
            type="email"
            value={searchEmail}
            onChange={(e) => setSearchEmail(e.target.value)}
            placeholder="subscriber@example.com"
            className={inputClass}
          />
          <button
            type="submit"
            disabled={searching || !searchEmail.trim()}
            className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white shadow-lg shadow-violet-600/20 transition-all duration-200 hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Search
          </button>
        </form>

        {searchError && <p className="mt-3 text-sm text-red-400">{searchError}</p>}

        {searchResult && (
          <div className="mt-5 space-y-4">
            {searchResult.subscriptions.length === 0 &&
            searchResult.consentEvents.length === 0 &&
            (!searchResult.account || !searchResult.account.exists) ? (
              <p className="text-sm text-zinc-500">No consent records found for this email.</p>
            ) : (
              <>
                {searchResult.account?.exists && (
                  <div>
                    <h3 className="text-sm font-medium text-white mb-2">Account-level announcements</h3>
                    <ul className="divide-y divide-zinc-800 border border-zinc-800 rounded-lg">
                      <li className="px-4 py-3 text-sm">
                        <p className="text-white">{searchResult.account.username}</p>
                        <p className="text-xs text-zinc-500 mt-0.5">
                          {searchResult.account.announcementsOptIn
                            ? `Opted in to platform announcements${searchResult.account.announcementsOptInAt ? ` on ${new Date(searchResult.account.announcementsOptInAt).toLocaleString()}` : ""}`
                            : searchResult.account.announcementsUnsubscribedAt
                              ? `Unsubscribed from platform announcements on ${new Date(searchResult.account.announcementsUnsubscribedAt).toLocaleString()}`
                              : "Never opted in to platform announcements"}
                          {searchResult.account.acceptedPoliciesAt
                            ? ` · Policies accepted ${new Date(searchResult.account.acceptedPoliciesAt).toLocaleString()}`
                            : ""}
                        </p>
                      </li>
                    </ul>
                  </div>
                )}
                {searchResult.subscriptions.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-white mb-2">Permanent subscription records</h3>
                    <ul className="divide-y divide-zinc-800 border border-zinc-800 rounded-lg">
                      {searchResult.subscriptions.map((sub, i) => (
                        <li key={i} className="px-4 py-3 text-sm">
                          <p className="flex items-center gap-2 text-white">
                            <span
                              className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                                sub.status === "unsubscribed"
                                  ? "bg-red-500/15 text-red-400"
                                  : "bg-emerald-500/15 text-emerald-400"
                              }`}
                            >
                              {sub.status === "unsubscribed" ? <UserX className="h-3 w-3" /> : <UserCheck className="h-3 w-3" />}
                              {sub.status}
                            </span>
                            {sub.email}
                          </p>
                          <p className="text-xs text-zinc-500 mt-0.5">
                            Profile {sub.profileId} · agreed {new Date(sub.agreedAt).toLocaleString()} · TOS v{sub.tosVersion} · Privacy v{sub.privacyVersion}
                            {sub.unsubscribedAt ? ` · unsubscribed ${new Date(sub.unsubscribedAt).toLocaleString()}` : ""}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {searchResult.consentEvents.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-white mb-2">Transient consent evidence (in-memory only, ≤ 24 h)</h3>
                    <ul className="divide-y divide-zinc-800 border border-zinc-800 rounded-lg">
                      {searchResult.consentEvents.map((ev, i) => (
                        <li key={i} className="px-4 py-3 text-sm">
                          <p className="text-white">{ev.at} · profile {ev.profileId}</p>
                          <p className="text-xs text-zinc-500 mt-0.5">IP {ev.ip} · UA {ev.userAgent || "(empty)"}</p>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/30 p-7 sm:p-8">
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-1">
            <UserCheck className="h-4 w-4 text-violet-400" />
            <h2 className="text-lg font-semibold text-white">Sender allowlist</h2>
          </div>
          <p className="text-sm text-zinc-500">
            Manually whitelist accounts to send newsletters from their own SMTP without the tier or DNS requirements — for
            example users on Proton Mail or Gmail SMTP, where the sending domain can&apos;t carry the verification TXT record.
            Whitelisted accounts are rate-limited at the Enterprise tier limits and still need a passed SMTP test email.
          </p>
        </div>

        <div className="flex gap-2.5">
          <input
            value={wlQuery}
            onChange={(e) => {
              setWlQuery(e.target.value);
              setWlPage(0);
            }}
            placeholder="Search by username or email"
            className={inputClass}
          />
          <button
            type="button"
            onClick={() => {
              setWlPage(0);
              void loadWhitelist(0);
            }}
            className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-100 transition-colors hover:bg-zinc-700"
          >
            <Search className="h-4 w-4" />
            Filter
          </button>
        </div>

        {wlError && <p className="mt-3 text-sm text-red-400">{wlError}</p>}

        <div className="mt-5">
          {wlLoading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-zinc-600" />
            </div>
          ) : wlUsers.length === 0 ? (
            <p className="text-sm text-zinc-500 text-center py-6">No accounts found. Whitelist an account so it can send from its own SMTP.</p>
          ) : (
            <ul className="divide-y divide-zinc-800 border border-zinc-800 rounded-lg">
              {wlUsers.map((u) => (
                <li key={u.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm text-white truncate">
                      {u.username} <span className="text-zinc-500">· {u.email}</span>
                    </p>
                    <p className="text-xs text-zinc-500 truncate">
                      Tier {u.tier} · {u.profiles.length} profile(s)
                      {u.profiles.length > 0 ? ` · ${u.profiles.map((p) => p.displayName || p.slug || "unnamed").join(", ")}` : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={wlToggling === u.id}
                    onClick={() => toggleWhitelist(u)}
                    className={`inline-flex flex-shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                      u.whitelisted
                        ? "bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25"
                        : "border border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                    }`}
                  >
                    {wlToggling === u.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : u.whitelisted ? <UserCheck className="h-3.5 w-3.5" /> : <UserX className="h-3.5 w-3.5" />}
                    {u.whitelisted ? "Whitelisted" : "Allowlist"}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <Pagination
            page={wlPage}
            total={wlTotal}
            pageSize={10}
            loading={wlLoading}
            onPage={(p) => {
              setWlPage(p);
              void loadWhitelist(p);
            }}
          />
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/30 p-7 sm:p-8">
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-1">
            <Megaphone className="h-4 w-4 text-violet-400" />
            <h2 className="text-lg font-semibold text-white">Platform announcements</h2>
          </div>
          <p className="text-sm text-zinc-500">
            Send an email to every user who opted in to platform news at registration (or in their account settings).
            Recipients get a one-click unsubscribe link tied to their account. Sent through the instance SMTP.
          </p>
        </div>

        <form onSubmit={sendBroadcast} className="space-y-3">
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Subject</label>
            <input
              type="text"
              value={broadcastSubject}
              maxLength={120}
              onChange={(e) => setBroadcastSubject(e.target.value)}
              placeholder="What's new on the platform…"
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Body</label>
            <textarea
              value={broadcastBody}
              maxLength={5000}
              rows={6}
              onChange={(e) => setBroadcastBody(e.target.value)}
              placeholder="Write your announcement here. Plain text and line breaks only."
              className={`${inputClass} resize-y`}
            />
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-zinc-500">
              {audienceCount === null ? "Loading audience…" : `${audienceCount} opted-in user(s) will receive this email.`}
            </p>
            <button
              type="submit"
              disabled={broadcasting || audienceCount === null || audienceCount === 0 || !broadcastSubject.trim() || !broadcastBody.trim()}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white shadow-lg shadow-violet-600/20 transition-all duration-200 hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {broadcasting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Megaphone className="h-4 w-4" />}
              {broadcasting ? "Sending…" : "Send broadcast"}
            </button>
          </div>
        </form>

        {broadcastNotice && (
          <p
            className={`mt-4 text-sm ${
              broadcastNotice.includes("failed") || broadcastNotice.startsWith("No users") || broadcastNotice.includes("exceed") || broadcastNotice.includes("delivery")
                ? "text-red-400"
                : "text-emerald-400"
            }`}
          >
            {broadcastNotice}
          </p>
        )}

        {broadcasts.length > 0 && (
          <div className="mt-6">
            <h3 className="text-sm font-medium text-white mb-2">Recent broadcasts</h3>
            <ul className="divide-y divide-zinc-800 border border-zinc-800 rounded-lg">
              {broadcasts.map((b) => (
                <li key={b.id} className="px-4 py-3 text-sm">
                  <p className="text-white truncate">{b.subject}</p>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    {new Date(b.sentAt).toLocaleString()} · {b.recipientCount} recipient(s) · {b.successCount} delivered
                  </p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}