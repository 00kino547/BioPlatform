import { useCallback, useEffect, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { api, type NewsletterConfig, type NewsletterSubscriber, type NewsletterTierConfig, type NewsletterWhitelistUser } from "@/lib/api";
import { formatDateTime } from "@/lib/intl";
import { Pagination } from "./Pagination";
import { Loader2, Mail, Megaphone, RotateCcw, Save, Search, ShieldCheck, UserCheck, UserX } from "lucide-react";

type TierName = "FREE" | "PRO" | "ENTERPRISE";

const TIERS: TierName[] = ["FREE", "PRO", "ENTERPRISE"];

const inputClass =
  "w-full rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-violet-500";

export function AdminNewsletterTab() {
  // Admin tab for newsletter tier limits, consent lookups, sender allowlist and broadcasts.
  const { t } = useTranslation("admin");
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
        setError(res.error ?? t("admin.newsletter.configLoadFailed"));
      }
    } catch {
      setError(t("admin.newsletter.configLoadFailed"));
    }
    setLoading(false);
  }, [syncDraft, t]);

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
        setError(res.error ?? t("admin.newsletter.configSaveFailed"));
      }
    } catch {
      setError(t("admin.newsletter.configSaveFailed"));
    }
    setSaving(false);
  };

  const reset = async () => {
    if (!window.confirm(t("admin.newsletter.resetConfirm"))) return;
    setResetting(true);
    setError("");
    try {
      const res = await api.resetNewsletterConfig();
      if (res.success && res.data) {
        setConfig(res.data);
        syncDraft(res.data.config);
      } else {
        setError(res.error ?? t("admin.newsletter.configResetFailed"));
      }
    } catch {
      setError(t("admin.newsletter.configResetFailed"));
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
      setSearchError(res.error ?? t("admin.newsletter.searchFailed"));
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
      setWlError(res.error ?? t("admin.newsletter.wlLoadFailed"));
    }
    setWlLoading(false);
  }, [wlQuery, t]);

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
      setWlError(res.error ?? t("admin.newsletter.wlUpdateFailed"));
    }
    setWlToggling(null);
  };

  const [broadcastSubject, setBroadcastSubject] = useState("");
  const [broadcastBody, setBroadcastBody] = useState("");
  const [audienceCount, setAudienceCount] = useState<number | null>(null);
  const [broadcasting, setBroadcasting] = useState(false);
  // Store tone + localized text separately so the error styling never depends on English substrings.
  const [broadcastNotice, setBroadcastNotice] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
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
    if (!window.confirm(t("admin.newsletter.sendConfirm", { count: audienceCount ?? 0 }))) return;
    setBroadcasting(true);
    setBroadcastNotice(null);
    try {
      const res = await api.sendNewsletterBroadcast({ subject: broadcastSubject.trim(), body: broadcastBody.trim() });
      if (res.success && res.data) {
        setBroadcastNotice({
          tone: "ok",
          text: t("admin.newsletter.broadcastSent", {
            recipients: res.data.recipientCount,
            delivered: res.data.successCount,
            failed: res.data.failedCount,
          }),
        });
        setBroadcastSubject("");
        setBroadcastBody("");
        void loadBroadcast();
      } else {
        setBroadcastNotice({ tone: "err", text: res.error ?? t("admin.newsletter.broadcastFailed") });
      }
    } catch {
      setBroadcastNotice({ tone: "err", text: t("admin.newsletter.broadcastFailed") });
    }
    setBroadcasting(false);
  };

  if (loading) {
    return <p className="text-sm text-zinc-500 text-center py-12">{t("admin.newsletter.loading")}</p>;
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
            <h2 className="text-lg font-semibold text-white">{t("admin.newsletter.tierLimitsTitle")}</h2>
          </div>
          <p className="text-sm text-zinc-500">
            <Trans
              ns="admin"
              i18nKey="admin.newsletter.tierLimitsDescription"
              values={{ source: config?.configSource === "db" ? t("admin.newsletter.sourceAdminOverride") : t("admin.newsletter.sourceDefault") }}
              components={{ strong: <span className="font-medium text-zinc-300" /> }}
            />
          </p>
        </div>

        {draft && (
          <div className="grid gap-4 sm:grid-cols-3">
            {TIERS.map((tier) => (
              <div key={tier} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
                <p className="text-sm font-semibold text-white mb-3">{tier}</p>
                <label className="block text-xs text-zinc-500 mb-1">{t("admin.newsletter.sendsPerWindow")}</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={draft[tier].sendLimit}
                  onChange={(e) => patchTier(tier, "sendLimit", e.target.value)}
                  className={`${inputClass} mb-3`}
                />
                <label className="block text-xs text-zinc-500 mb-1">{t("admin.newsletter.windowHours")}</label>
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
            {saving ? t("admin.newsletter.saving") : dirty ? t("admin.newsletter.save") : t("admin.newsletter.saved")}
          </button>
          <button
            type="button"
            onClick={reset}
            disabled={resetting}
            className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-100 transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RotateCcw className="h-4 w-4" />
            {resetting ? t("admin.newsletter.resetting") : t("admin.newsletter.resetToDefaults")}
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/30 p-7 sm:p-8">
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-1">
            <ShieldCheck className="h-4 w-4 text-violet-400" />
            <h2 className="text-lg font-semibold text-white">{t("admin.newsletter.consentSearchTitle")}</h2>
          </div>
          <p className="text-sm text-zinc-500">
            {t("admin.newsletter.consentSearchDescription")}
          </p>
        </div>

        <form onSubmit={searchConsent} className="flex gap-2.5">
          <input
            type="email"
            value={searchEmail}
            onChange={(e) => setSearchEmail(e.target.value)}
            placeholder={t("admin.newsletter.searchPlaceholder")}
            className={inputClass}
          />
          <button
            type="submit"
            disabled={searching || !searchEmail.trim()}
            className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white shadow-lg shadow-violet-600/20 transition-all duration-200 hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            {t("admin.newsletter.search")}
          </button>
        </form>

        {searchError && <p className="mt-3 text-sm text-red-400">{searchError}</p>}

        {searchResult && (
          <div className="mt-5 space-y-4">
            {searchResult.subscriptions.length === 0 &&
            searchResult.consentEvents.length === 0 &&
            (!searchResult.account || !searchResult.account.exists) ? (
              <p className="text-sm text-zinc-500">{t("admin.newsletter.noConsentRecords")}</p>
            ) : (
              <>
                {searchResult.account?.exists && (
                  <div>
                    <h3 className="text-sm font-medium text-white mb-2">{t("admin.newsletter.accountAnnouncements")}</h3>
                    <ul className="divide-y divide-zinc-800 border border-zinc-800 rounded-lg">
                      <li className="px-4 py-3 text-sm">
                        <p className="text-white">{searchResult.account.username}</p>
                        <p className="text-xs text-zinc-500 mt-0.5">
                          {searchResult.account.announcementsOptIn
                            ? searchResult.account.announcementsOptInAt
                              ? t("admin.newsletter.optedInOn", { date: formatDateTime(searchResult.account.announcementsOptInAt) })
                              : t("admin.newsletter.optedIn")
                            : searchResult.account.announcementsUnsubscribedAt
                              ? t("admin.newsletter.unsubscribedOn", { date: formatDateTime(searchResult.account.announcementsUnsubscribedAt) })
                              : t("admin.newsletter.neverOptedIn")}
                          {searchResult.account.acceptedPoliciesAt
                            ? t("admin.newsletter.policiesAccepted", { date: formatDateTime(searchResult.account.acceptedPoliciesAt) })
                            : ""}
                        </p>
                      </li>
                    </ul>
                  </div>
                )}
                {searchResult.subscriptions.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-white mb-2">{t("admin.newsletter.permanentRecords")}</h3>
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
                              {sub.status === "unsubscribed" ? t("admin.newsletter.statusUnsubscribed") : t("admin.newsletter.statusSubscribed")}
                            </span>
                            {sub.email}
                          </p>
                          <p className="text-xs text-zinc-500 mt-0.5">
                            {t("admin.newsletter.profileLine", {
                              profileId: sub.profileId,
                              date: formatDateTime(sub.agreedAt),
                              tos: sub.tosVersion,
                              privacy: sub.privacyVersion,
                            })}
                            {sub.unsubscribedAt ? t("admin.newsletter.unsubscribedSuffix", { date: formatDateTime(sub.unsubscribedAt) }) : ""}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {searchResult.consentEvents.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-white mb-2">{t("admin.newsletter.transientEvidence")}</h3>
                    <ul className="divide-y divide-zinc-800 border border-zinc-800 rounded-lg">
                      {searchResult.consentEvents.map((ev, i) => (
                        <li key={i} className="px-4 py-3 text-sm">
                          <p className="text-white">{t("admin.newsletter.evidenceLine", { at: ev.at, profileId: ev.profileId })}</p>
                          <p className="text-xs text-zinc-500 mt-0.5">
                            {t("admin.newsletter.evidenceIpUa", { ip: ev.ip, ua: ev.userAgent || t("admin.newsletter.emptyUa") })}
                          </p>
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
            <h2 className="text-lg font-semibold text-white">{t("admin.newsletter.senderAllowlistTitle")}</h2>
          </div>
          <p className="text-sm text-zinc-500">
            {t("admin.newsletter.senderAllowlistDescription")}
          </p>
        </div>

        <div className="flex gap-2.5">
          <input
            value={wlQuery}
            onChange={(e) => {
              setWlQuery(e.target.value);
              setWlPage(0);
            }}
            placeholder={t("admin.newsletter.wlSearchPlaceholder")}
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
            {t("admin.newsletter.filter")}
          </button>
        </div>

        {wlError && <p className="mt-3 text-sm text-red-400">{wlError}</p>}

        <div className="mt-5">
          {wlLoading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-zinc-600" />
            </div>
          ) : wlUsers.length === 0 ? (
            <p className="text-sm text-zinc-500 text-center py-6">{t("admin.newsletter.wlEmpty")}</p>
          ) : (
            <ul className="divide-y divide-zinc-800 border border-zinc-800 rounded-lg">
              {wlUsers.map((u) => (
                <li key={u.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm text-white truncate">
                      {u.username} <span className="text-zinc-500">· {u.email}</span>
                    </p>
                    <p className="text-xs text-zinc-500 truncate">
                      {t("admin.newsletter.tierProfiles", { tier: u.tier, count: u.profiles.length })}
                      {u.profiles.length > 0 ? t("admin.newsletter.profilesSuffix", { names: u.profiles.map((p) => p.displayName || p.slug || t("admin.newsletter.unnamed")).join(", ") }) : ""}
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
                    {u.whitelisted ? t("admin.newsletter.whitelisted") : t("admin.newsletter.allowlist")}
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
            <h2 className="text-lg font-semibold text-white">{t("admin.newsletter.announcementsTitle")}</h2>
          </div>
          <p className="text-sm text-zinc-500">
            {t("admin.newsletter.announcementsDescription")}
          </p>
        </div>

        <form onSubmit={sendBroadcast} className="space-y-3">
          <div>
            <label className="block text-xs text-zinc-500 mb-1">{t("admin.newsletter.subject")}</label>
            <input
              type="text"
              value={broadcastSubject}
              maxLength={120}
              onChange={(e) => setBroadcastSubject(e.target.value)}
              placeholder={t("admin.newsletter.subjectPlaceholder")}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-1">{t("admin.newsletter.body")}</label>
            <textarea
              value={broadcastBody}
              maxLength={5000}
              rows={6}
              onChange={(e) => setBroadcastBody(e.target.value)}
              placeholder={t("admin.newsletter.bodyPlaceholder")}
              className={`${inputClass} resize-y`}
            />
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-zinc-500">
              {audienceCount === null ? t("admin.newsletter.loadingAudience") : t("admin.newsletter.audienceCount", { count: audienceCount })}
            </p>
            <button
              type="submit"
              disabled={broadcasting || audienceCount === null || audienceCount === 0 || !broadcastSubject.trim() || !broadcastBody.trim()}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white shadow-lg shadow-violet-600/20 transition-all duration-200 hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {broadcasting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Megaphone className="h-4 w-4" />}
              {broadcasting ? t("admin.newsletter.sending") : t("admin.newsletter.sendBroadcast")}
            </button>
          </div>
        </form>

        {broadcastNotice && (
          <p
            className={`mt-4 text-sm ${
              broadcastNotice.tone === "ok" ? "text-emerald-400" : "text-red-400"
            }`}
          >
            {broadcastNotice.text}
          </p>
        )}

        {broadcasts.length > 0 && (
          <div className="mt-6">
            <h3 className="text-sm font-medium text-white mb-2">{t("admin.newsletter.recentBroadcasts")}</h3>
            <ul className="divide-y divide-zinc-800 border border-zinc-800 rounded-lg">
              {broadcasts.map((b) => (
                <li key={b.id} className="px-4 py-3 text-sm">
                  <p className="text-white truncate">{b.subject}</p>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    {t("admin.newsletter.broadcastMeta", {
                      date: formatDateTime(b.sentAt),
                      recipients: b.recipientCount,
                      delivered: b.successCount,
                    })}
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