import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { api, type InviteCodeInfo, type InviteMeta } from "@/lib/api";
import { formatDate as formatLocaleDate } from "@/lib/intl";
import { Button } from "@/components/ui/button";
import { Copy, RefreshCw, Trash2, Ticket, Timer, Ban, Lock, Users, Check } from "lucide-react";
import { InviteCreditStore } from "./InviteCreditStore";

// Never → t("invites.never"); callers pass the translated label in.
function formatDate(iso: string | null | undefined, neverLabel: string) {
  if (!iso) return neverLabel;
  return formatLocaleDate(iso);
}

export function InvitesTab() {
  // All user-facing strings come from the `dashboard` namespace (invites.* keys).
  const { t } = useTranslation("dashboard");
  const [codes, setCodes] = useState<InviteCodeInfo[]>([]);
  const [meta, setMeta] = useState<InviteMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [count, setCount] = useState(1);
  const [expiresDays, setExpiresDays] = useState("");
  const [busy, setBusy] = useState(false);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [savingNoteId, setSavingNoteId] = useState<string | null>(null);

  useEffect(() => {
    const drafts: Record<string, string> = {};
    for (const c of codes) drafts[c.id] = c.note ?? "";
    setNoteDrafts(drafts);
  }, [codes]);

  const load = useCallback(async () => {
    try {
      const res = await api.getInvites();
      if (res.success && Array.isArray(res.data)) {
        setCodes(res.data);
        setMeta(res.meta ?? null);
      } else {
        setError(res.error ?? t("invites.toasts.loadFailed"));
      }
    } catch {
      setError(t("invites.toasts.loadFailed"));
    }
    setLoading(false);
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const handleGenerate = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setMessage("");
    setBusy(true);
    const body: { count: number; expiresInDays?: number } = { count };
    if (expiresDays) body.expiresInDays = Number(expiresDays);
    const res = await api.generateInvites(body);
    setBusy(false);
    if (!res.success) {
      setError(res.error ?? t("invites.toasts.generateFailed"));
      return;
    }
    await load();
    setMessage(t("invites.toasts.generated"));
    setCount(1);
    setExpiresDays("");
    setTimeout(() => setMessage(""), 2500);
  };

  const handleRevoke = async (id: string) => {
    const res = await api.revokeInvite(id);
    if (res.success) {
      setCodes((prev) =>
        prev.map((c) => (c.id === id ? { ...c, revokedAt: new Date().toISOString() } : c))
      );
    } else {
      setError(res.error ?? t("invites.toasts.revokeFailed"));
    }
  };

  const handleSaveNote = async (id: string) => {
    const note = (noteDrafts[id] ?? "").trim();
    setSavingNoteId(id);
    const res = await api.setInviteNote(id, note.length ? note : null);
    setSavingNoteId(null);
    const savedNote = res.success ? res.data?.note : undefined;
    if (savedNote !== undefined) {
      setCodes((prev) => prev.map((c) => (c.id === id ? { ...c, note: savedNote } : c)));
      setError("");
    } else {
      setError(res.error ?? t("invites.toasts.saveNoteFailed"));
    }
  };

  const copy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setMessage(t("invites.toasts.copied"));
      setTimeout(() => setMessage(""), 2000);
    } catch {
      setMessage("");
    }
  };

  if (loading) {
    return <p className="text-sm text-zinc-500 text-center py-12">{t("invites.loading")}</p>;
  }

  const cooldown = meta?.cooldownRemainingSeconds ?? 0;
  const maxBatch = meta?.role.canGenerate ? meta.role.batchLimit : 0;
  const defaultExpiry = meta?.role.defaultExpiryDays;
  const maxDays = meta?.role.maxExpiryDays;
  const minDays = meta?.role.minExpiryDays;
  // Translated "Never" fallback for every date cell below.
  const neverLabel = t("invites.never");

  return (
    <div className="space-y-4">
      {meta?.banned && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 flex items-start gap-3">
          <Ban className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-medium text-white">{t("invites.suspendedTitle")}</h4>
            <p className="text-xs text-zinc-400 mt-1">
              {t("invites.suspendedBody")}
            </p>
          </div>
        </div>
      )}

      {/* Hidden while banned: the backend refuses purchases from a banned account,
          so offering the store here would only produce an error. */}
      {!meta?.banned && (
        <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/30 p-7 sm:p-8">
          <h2 className="text-lg font-semibold text-white mb-1">{t("invites.buyCredits")}</h2>
          <p className="text-sm text-zinc-500 mb-5">
            {t("invites.buyCreditsHint")}
          </p>
          <InviteCreditStore />
        </div>
      )}

      {meta?.seat?.limited && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3.5">
          <div className="flex items-center gap-2 mb-2">
            <Users className="h-4 w-4 text-amber-400" />
            <h4 className="text-sm font-medium text-white">{t("invites.teamSeats")}</h4>
          </div>
          <div className="flex items-center gap-4">
            <div>
              <p className="text-2xl font-bold text-white">
                {meta.seat.used}
                <span className="text-lg text-zinc-400"> / {meta.seat.limit}</span>
              </p>
              <p className="text-xs text-zinc-500 mt-1">{t("invites.membersJoined")}</p>
            </div>
            <div className="flex-1 h-2 rounded-full bg-zinc-700 overflow-hidden">
              <div
                className="h-full rounded-full bg-amber-400 transition-all"
                style={{ width: `${Math.min(100, (meta.seat.used / meta.seat.limit) * 100)}%` }}
              />
            </div>
          </div>
          <p className="text-xs text-zinc-400 mt-3">
            {meta.seat.remaining > 0
              ? t("invites.seatsRemaining", { count: meta.seat.remaining, s: meta.seat.remaining === 1 ? "" : "s" })
              : t("invites.seatLimitReached")}
          </p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-3.5">
          <div className="flex items-center gap-2 mb-2">
            <Ticket className="h-4 w-4 text-violet-400" />
            <h4 className="text-sm font-medium text-white">{t("invites.eventAllowance")}</h4>
          </div>
          <p className="text-2xl font-bold text-white">{meta?.allowance ?? 0}</p>
          <p className="text-xs text-zinc-500 mt-1">
            {t("invites.expires")} {formatDate(meta?.allowanceExpiresAt, neverLabel)}
          </p>
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-3.5">
          <div className="flex items-center gap-2 mb-2">
            <Lock className="h-4 w-4 text-violet-400" />
            <h4 className="text-sm font-medium text-white">{t("invites.roleQuota")}</h4>
          </div>
          <p className="text-2xl font-bold text-white">
            {meta?.role.canGenerate ? t("invites.maxPerBatch", { max: maxBatch }) : "—"}
          </p>
          <p className="text-xs text-zinc-500 mt-1">
            {meta?.role.canGenerate
              ? meta.role.outstandingLimit > 0
                ? t("invites.maxOutstanding", { count: meta.role.outstandingLimit })
                : t("invites.unlimitedOutstanding")
              : t("invites.cannotGenerate")}
          </p>
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-3.5">
          <div className="flex items-center gap-2 mb-2">
            <Timer className="h-4 w-4 text-violet-400" />
            <h4 className="text-sm font-medium text-white">{t("invites.outstanding")}</h4>
          </div>
          <p className="text-2xl font-bold text-white">{meta?.outstanding ?? 0}</p>
          <p className="text-xs text-zinc-500 mt-1">{t("invites.outstandingHint")}</p>
        </div>
      </div>

      {!meta?.banned && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-3.5">
          <h4 className="text-sm font-medium text-white mb-1">{t("invites.generateTitle")}</h4>
          <p className="text-xs text-zinc-500 mb-4">
            {meta?.role.canGenerate
              ? t("invites.batchExplanation", {
                  max: maxBatch,
                  cooldown:
                    meta.role.cooldownMinutes > 0
                      ? t("invites.batchCooldown", { minutes: meta.role.cooldownMinutes })
                      : "",
                })
              : t("invites.eventOnly")}
            {meta?.allowanceActive && meta.allowanceExpiresAt
              ? t("invites.eventExpiryNote", { date: formatDate(meta.allowanceExpiresAt, neverLabel) })
              : ""}
          </p>

          {error && (
            <div className="mb-4 rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}
          {message && (
            <div className="mb-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-4 py-3 text-sm text-emerald-400">
              {message}
            </div>
          )}

          {!meta?.generationEnabled ? (
            <p className="text-sm text-zinc-500">
              {t("invites.generationDisabled")}
            </p>
          ) : cooldown > 0 ? (
            <p className="text-sm text-amber-400">
              {t("invites.cooldown", { seconds: cooldown })}
            </p>
          ) : meta?.allowanceActive || meta?.role.canGenerate ? (
            <form onSubmit={handleGenerate} className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <label className="block text-[13px] font-medium text-zinc-300 mb-1.5">{t("invites.count")}</label>
                <input
                  type="number"
                  min={1}
                  max={Math.max(maxBatch, meta?.allowance ?? 1)}
                  value={count}
                  onChange={(e) => setCount(Number(e.target.value))}
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-2.5 text-sm text-white outline-none transition-colors focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30"
                />
              </div>
              <div className="flex-1">
                <label className="block text-[13px] font-medium text-zinc-300 mb-1.5">
                  {t("invites.expiresInDays")}{" "}
                  <span className="text-zinc-500">
                    {t("invites.expiresHint", {
                      default: defaultExpiry ?? "—",
                      min: minDays ?? "—",
                      max: maxDays ?? "—",
                    })}
                  </span>
                </label>
                <input
                  type="number"
                  min={minDays ?? 1}
                  max={maxDays ?? 365}
                  value={expiresDays}
                  onChange={(e) => setExpiresDays(e.target.value)}
                  placeholder={String(defaultExpiry ?? 30)}
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-2.5 text-sm text-white placeholder-zinc-500 outline-none transition-colors focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30"
                />
              </div>
              <div className="flex items-end">
                <Button type="submit" disabled={busy} className="whitespace-nowrap">
                  {busy ? t("invites.generating") : t("invites.generate")}
                </Button>
              </div>
            </form>
          ) : (
            <p className="text-sm text-zinc-500">
              {t("invites.noCredits")}
            </p>
          )}
        </div>
      )}

      <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-3.5">
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-sm font-medium text-white">{t("invites.myCodes")}</h4>
          <button
            onClick={load}
            className="text-xs text-zinc-400 hover:text-white transition-colors flex items-center gap-1"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            {t("invites.refresh")}
          </button>
        </div>

        {codes.length === 0 ? (
          <p className="text-sm text-zinc-500">{t("invites.noCodes")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800/60 text-left text-zinc-500">
                  <th className="pb-3 font-medium">{t("invites.tableCode")}</th>
                  <th className="pb-3 font-medium">{t("invites.tableStatus")}</th>
                  <th className="pb-3 font-medium">{t("invites.tableExpires")}</th>
                  <th className="pb-3 font-medium">{t("invites.tableCreated")}</th>
                  <th className="pb-3 font-medium">{t("invites.tableNote")}</th>
                  <th className="pb-3 font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/40">
                {codes.map((c) => {
                  const expired = c.expiresAt && new Date(c.expiresAt).getTime() < Date.now();
                  return (
                    <tr key={c.id}>
                      <td className="py-3 font-mono text-zinc-300">
                        {c.code}
                        {c.purchased ? (
                          <span className="ml-2 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-400 border border-emerald-500/20">
                            {t("invites.statusPurchased")}
                          </span>
                        ) : c.fromAllowance ? (
                          <span className="ml-2 rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] font-semibold text-violet-400 border border-violet-500/20">
                            {t("invites.statusEvent")}
                          </span>
                        ) : null}
                      </td>
                      <td className="py-3">
                        {c.revokedAt ? (
                          <span className="text-red-400">{t("invites.statusRevoked")}</span>
                        ) : c.usedById ? (
                          <span className="text-zinc-500">{t("invites.statusUsed")}</span>
                        ) : expired ? (
                          <span className="text-zinc-500">{t("invites.statusExpired")}</span>
                        ) : (
                          <span className="text-emerald-400">{t("invites.statusAvailable")}</span>
                        )}
                      </td>
                      <td className="py-3 text-zinc-500">{formatDate(c.expiresAt, neverLabel)}</td>
                      <td className="py-3 text-zinc-500">{formatDate(c.createdAt, neverLabel)}</td>
                      <td className="py-3">
                        <div className="flex items-center gap-2">
                          <input
                            value={noteDrafts[c.id] ?? ""}
                            onChange={(e) =>
                              setNoteDrafts((d) => ({ ...d, [c.id]: e.target.value }))
                            }
                            maxLength={500}
                            placeholder={t("invites.notePlaceholder")}
                            className="w-44 rounded-md border border-zinc-800 bg-zinc-900/60 px-2 py-1.5 text-xs text-white placeholder-zinc-600 outline-none transition-colors focus:border-violet-500/50"
                          />
                          <button
                            onClick={() => handleSaveNote(c.id)}
                            disabled={savingNoteId === c.id}
                            className="text-xs text-violet-400 hover:text-violet-300 transition-colors disabled:opacity-50"
                            title={t("invites.saveNoteTitle")}
                          >
                            {savingNoteId === c.id ? (
                              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Check className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </div>
                      </td>
                      <td className="py-3">
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => copy(c.code)}
                            className="text-xs text-violet-400 hover:text-violet-300 transition-colors"
                            title={t("invites.copyCodeTitle")}
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </button>
                          {!c.usedById && !c.revokedAt && !expired && (
                            <button
                              onClick={() => handleRevoke(c.id)}
                              className="text-xs text-red-400 hover:text-red-300 transition-colors"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
