import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { api, type DmcaStatus } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/intl";
import { Pagination } from "./Pagination";
import {
  ArrowLeft,
  Ban,
  CheckCircle2,
  Eye,
  Gavel,
  Hash,
  Loader2,
  RefreshCw,
  Scale,
  Search,
  ShieldCheck,
  Trash2,
  UserX,
} from "lucide-react";

/**
 * Admin → Moderation: DMCA report review, media search, hash bans and the
 * disabled-account queue (backend: routes/adminDmca.ts).
 *
 * Kept in its own file like the other admin tabs: the dashboard already renders
 * every tab inline, and this one carries four independent views plus a media
 * search picker, all with their own loading/error state.
 *
 * Safety notes implemented here, matching the backend contract:
 * - a takedown removes EVERY copy of the chosen bytes across all accounts, so
 *   the picker previews the copy count before the operator confirms;
 * - a counter-notice lifts hash bans but NEVER re-activates an account — that
 *   stays a deliberate operator decision on the Disabled accounts view;
 * - deleting a report un-bans its hashes first (deleteReport), and the history
 *   rows stay as the legal record.
 */

type SubView = "queue" | "media" | "hashes" | "disabled";

export function ModerationTab({ locked }: { locked: boolean }) {
  const { t } = useTranslation("admin");
  const [view, setView] = useState<SubView>("queue");
  const [detailId, setDetailId] = useState<string | null>(null);

  const tabs: Array<{ value: SubView; label: string }> = [
    { value: "queue", label: t("admin.moderation.views.queue") },
    { value: "media", label: t("admin.moderation.views.media") },
    { value: "hashes", label: t("admin.moderation.views.hashes") },
    { value: "disabled", label: t("admin.moderation.views.disabled") },
  ];

  return (
    <section className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Gavel size={18} className="text-violet-400" />
          <h2 className="text-lg font-semibold text-white">{t("admin.moderation.heading")}</h2>
        </div>
      </header>

      <div className="flex flex-wrap gap-1">
        {tabs.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => setView(t.value)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              view === t.value ? "bg-zinc-800 text-white" : "text-zinc-400 hover:text-zinc-300"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {view === "queue" ? (
        detailId ? (
          <ReportDetail reportId={detailId} locked={locked} onBack={() => setDetailId(null)} />
        ) : (
          <ReportQueue onOpen={(id) => setDetailId(id)} />
        )
      ) : view === "media" ? (
        <MediaSearch mode="search" locked={locked} />
      ) : view === "hashes" ? (
        <HashesPanel locked={locked} />
      ) : (
        <DisabledPanel locked={locked} />
      )}
    </section>
  );
}

/* ---------------------------------------------------------------------------
 * Reports
 * ------------------------------------------------------------------------- */

type ReportRow = {
  id: string;
  status: DmcaStatus;
  claimantName: string;
  claimantEmail: string;
  workUrl: string;
  createdAt: string;
  handledAt: string | null;
  counterNoticeAt: string | null;
  filedBy: string | null;
  activeHashes: number;
};

function statusClass(status: DmcaStatus): string {
  switch (status) {
    case "NEW":
      return "bg-amber-500/15 text-amber-400";
    case "TAKEN_DOWN":
      return "bg-emerald-500/15 text-emerald-400";
    case "DISMISSED":
      return "bg-zinc-700/40 text-zinc-400";
    case "COUNTER_NOTICE":
      return "bg-sky-500/15 text-sky-400";
    default:
      return "bg-zinc-700/40 text-zinc-400";
  }
}

function ReportQueue({ onOpen }: { onOpen: (id: string) => void }) {
  const { t } = useTranslation("admin");
  const [status, setStatus] = useState<DmcaStatus | undefined>(undefined);
  const [q, setQ] = useState("");
  const [appliedQ, setAppliedQ] = useState("");
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [counts, setCounts] = useState<Record<DmcaStatus, number> | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getAdminDmcaReports({ status, q: appliedQ, limit: 20, offset: page * 20 });
      if (!res.success || !res.data) {
        setError(res.error ?? t("admin.moderation.queue.loadFailed"));
        return;
      }
      // Rows are `data`; `counts`/`pagination` are siblings (see api.ts ApiResponse).
      setReports(res.data);
      setCounts((res.counts as Record<DmcaStatus, number> | undefined) ?? null);
      setTotal(res.pagination?.total ?? 0);
    } catch {
      setError(t("admin.moderation.queue.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [status, appliedQ, page, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const submitSearch = (e: FormEvent) => {
    e.preventDefault();
    setAppliedQ(q.trim());
    setPage(0);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {(["NEW", "TAKEN_DOWN", "DISMISSED", "COUNTER_NOTICE"] as DmcaStatus[]).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => {
              setStatus(status === s ? undefined : s);
              setPage(0);
            }}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              status === s ? statusClass(s) : "bg-zinc-800/70 text-zinc-400 hover:text-zinc-200"
            }`}
          >
            {t(`admin.moderation.statuses.${s}`)} · {counts ? counts[s] : "…"}
          </button>
        ))}
        <span className="ml-auto text-xs text-zinc-500">{t("admin.moderation.queue.reportCount", { count: total, s: total === 1 ? "" : "s" })}</span>
      </div>

      <form onSubmit={submitSearch} className="flex gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("admin.moderation.queue.searchPlaceholder")}
          className="w-full rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-2 text-sm text-white outline-none transition-colors placeholder:text-zinc-600 focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30"
        />
        <Button type="submit" variant="outline" className="shrink-0">
          <Search size={14} className="mr-1.5" aria-hidden />
          {t("admin.moderation.queue.search")}
        </Button>
      </form>

      {error ? (
        <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="text-sm text-zinc-500">{t("admin.moderation.queue.loading")}</p>
      ) : reports.length === 0 ? (
        <p className="text-sm text-zinc-500">{t("admin.moderation.queue.empty")}</p>
      ) : (
        <ul className="space-y-2">
          {reports.map((r) => (
            <li
              key={r.id}
              className="flex flex-col gap-2 rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 text-sm text-white">
                  <span className="truncate font-medium">{r.claimantName}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusClass(r.status)}`}>
                    {t(`admin.moderation.statuses.${r.status}`)}
                  </span>
                  {r.activeHashes > 0 && (
                    <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-400">
                      {t("admin.moderation.queue.activeBan", { count: r.activeHashes, s: r.activeHashes === 1 ? "" : "s" })}
                    </span>
                  )}
                </p>
                <p className="mt-1 truncate text-xs text-zinc-500">
                  {r.claimantEmail} ·{" "}
                  <span className="font-mono text-zinc-600">{(r.workUrl || t("admin.moderation.queue.noWorkUrl")).slice(0, 60)}</span>
                  {r.filedBy ? ` · ${t("admin.moderation.queue.filedBy", { username: r.filedBy })}` : ` · ${t("admin.moderation.queue.filedByGuest")}`}
                </p>
                <p className="mt-0.5 text-[11px] text-zinc-600">
                  {formatDateTime(r.createdAt)}
                  {r.handledAt ? ` · ${t("admin.moderation.queue.handled", { date: formatDateTime(r.handledAt) })}` : ""}
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={() => onOpen(r.id)}>
                <Eye size={14} className="mr-1.5" aria-hidden />
                {t("admin.moderation.queue.review")}
              </Button>
            </li>
          ))}
        </ul>
      )}

      <Pagination page={page} total={total} pageSize={20} onPage={setPage} loading={loading} />
    </div>
  );
}

type ReportDetailData = {
  id: string;
  status: DmcaStatus;
  claimantName: string;
  claimantEmail: string;
  workUrl: string;
  description: string;
  infringingUrls: string[];
  contactNote: string | null;
  createdAt: string;
  handledAt: string | null;
  decisionNote: string | null;
  counterNotice: string | null;
  counterNoticeAt: string | null;
  filedByUser: { id: string; username: string } | null;
  handledBy: { id: string; username: string } | null;
  hashes: Array<{
    id: string;
    sha256: string;
    reason: string | null;
    bannedAt: string;
    unbannedAt: string | null;
    unbannedBy: { id: string; username: string } | null;
  }>;
};

export function ReportDetail({ reportId, locked, onBack }: { reportId: string; locked: boolean; onBack: () => void }) {
  const { t } = useTranslation("admin");
  const [report, setReport] = useState<ReportDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pickMedia, setPickMedia] = useState(false);
  const [dismissNote, setDismissNote] = useState("");
  const [counterText, setCounterText] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getAdminDmcaReport(reportId);
      if (!res.success || !res.data) {
        setError(res.error ?? t("admin.moderation.detail.loadFailed"));
        return;
      }
      setReport(res.data);
    } catch {
      setError(t("admin.moderation.detail.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [reportId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const reset = () => {
    setDismissNote("");
    setCounterText("");
    setNotice(null);
  };

  const dismiss = async () => {
    setBusy("dismiss");
    setNotice(null);
    const res = await api.dismissAdminDmcaReport(reportId, dismissNote);
    setBusy(null);
    if (!res.success) {
      setNotice({ tone: "err", text: res.error ?? t("admin.moderation.detail.dismissFailed") });
      return;
    }
    // reset() also clears `notice`, so it must run BEFORE the success notice;
    // otherwise the OK banner is wiped in the same render batch and never shows.
    reset();
    setNotice({ tone: "ok", text: t("admin.moderation.detail.dismissed") });
    await load();
  };

  const recordCounter = async () => {
    setBusy("counter");
    setNotice(null);
    const res = await api.recordAdminDmcaCounterNotice(reportId, counterText);
    setBusy(null);
    if (!res.success) {
      setNotice({ tone: "err", text: res.error ?? t("admin.moderation.detail.counterFailed") });
      return;
    }
    // See dismiss(): reset() clears `notice`, so it must precede the toast.
    reset();
    setNotice({ tone: "ok", text: t("admin.moderation.detail.counterRecorded") });
    await load();
  };

  const remove = async () => {
    const ok = window.confirm(t("admin.moderation.detail.deleteConfirm"));
    if (!ok) return;
    setBusy("delete");
    setNotice(null);
    const res = await api.deleteAdminDmcaReport(reportId);
    setBusy(null);
    if (!res.success) {
      setNotice({ tone: "err", text: res.error ?? t("admin.moderation.detail.deleteFailed") });
      return;
    }
    onBack();
  };

  if (loading) return <p className="text-sm text-zinc-500">{t("admin.moderation.detail.loading")}</p>;
  if (error || !report) {
    return (
      <div className="space-y-3">
        <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </p>
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft size={14} className="mr-1.5" aria-hidden />
          {t("admin.moderation.detail.backToQueue")}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Button variant="outline" size="sm" onClick={onBack}>
          <ArrowLeft size={14} className="mr-1.5" aria-hidden />
          {t("admin.moderation.detail.queue")}
        </Button>
        <span className={`rounded-full px-3 py-1 text-xs font-medium ${statusClass(report.status)}`}>
          {t(`admin.moderation.statuses.${report.status}`)}
        </span>
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-5">
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <Field label={t("admin.moderation.detail.claimant")} value={`${report.claimantName} <${report.claimantEmail}>`} />
          <Field label={t("admin.moderation.detail.workUrl")} value={report.workUrl || "—"} mono />
          <Field label={t("admin.moderation.detail.filed")} value={formatDateTime(report.createdAt)} />
          <Field
            label={t("admin.moderation.detail.filedBy")}
            value={report.filedByUser ? `@${report.filedByUser.username}` : t("admin.moderation.detail.guestFiled")}
          />
          {report.handledAt ? (
            <Field label={t("admin.moderation.detail.handled")} value={`${formatDateTime(report.handledAt)}${report.handledBy ? t("admin.moderation.detail.handledBy", { username: report.handledBy.username }) : ""}`} />
          ) : null}
          {report.decisionNote ? <Field label={t("admin.moderation.detail.decisionNote")} value={report.decisionNote} wide /> : null}
        </dl>

        <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-zinc-500">{t("admin.moderation.detail.description")}</p>
        <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-300">{report.description || "—"}</p>

        {report.infringingUrls.length > 0 ? (
          <>
            <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-zinc-500">
              {t("admin.moderation.detail.infringingUrls")}
            </p>
            <ul className="mt-1 space-y-1">
              {report.infringingUrls.map((url) => (
                <li key={url} className="truncate font-mono text-xs text-zinc-400">
                  {url}
                </li>
              ))}
            </ul>
          </>
        ) : null}

        {report.contactNote ? (
          <>
            <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-zinc-500">{t("admin.moderation.detail.contactNote")}</p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-300">{report.contactNote}</p>
          </>
        ) : null}

        {report.counterNotice ? (
          <div className="mt-4 rounded-lg border border-sky-500/20 bg-sky-500/5 px-4 py-3">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-sky-400">
              <Scale size={13} aria-hidden /> {t("admin.moderation.detail.counterNotice")}
              {report.counterNoticeAt ? ` · ${formatDateTime(report.counterNoticeAt)}` : ""}
            </p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-300">{report.counterNotice}</p>
          </div>
        ) : null}
      </div>

      {report.hashes.length > 0 ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-5">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
            <Hash size={15} className="text-zinc-400" aria-hidden />
            {t("admin.moderation.detail.hashBansTitle")}
          </h3>
          <ul className="mt-3 space-y-2">
            {report.hashes.map((h) => (
              <li key={h.id} className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-mono text-zinc-300">{h.sha256.slice(0, 16)}…</span>
                <span
                  className={`rounded-full px-2 py-0.5 font-medium ${
                    h.unbannedAt ? "bg-zinc-700/40 text-zinc-400" : "bg-red-500/15 text-red-400"
                  }`}
                >
                  {h.unbannedAt ? t("admin.moderation.detail.unbanned") : t("admin.moderation.detail.activeBan")}
                </span>
                {h.unbannedAt ? (
                  <span className="text-zinc-500">
                    {t("admin.moderation.detail.lifted", { date: formatDateTime(h.unbannedAt) })}
                    {h.unbannedBy ? t("admin.moderation.detail.byUser", { username: h.unbannedBy.username }) : ""}
                  </span>
                ) : (
                  <span className="text-zinc-500">
                    {t("admin.moderation.detail.since", { date: formatDateTime(h.bannedAt) })}
                    {h.reason ? ` · ${h.reason}` : ""}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {notice ? (
        <p
          role="status"
          className={`rounded-lg border px-4 py-3 text-sm ${
            notice.tone === "ok"
              ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
              : "border-red-500/20 bg-red-500/10 text-red-400"
          }`}
        >
          {notice.text}
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* First-line decisions */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-5">
          <h3 className="text-sm font-semibold text-white">{t("admin.moderation.detail.takeDownTitle")}</h3>
          <p className="mt-1 text-xs text-zinc-500">
            {t("admin.moderation.detail.takeDownBody")}
          </p>
          {pickMedia ? (
            <MediaSearch mode="takedown" reportId={reportId} locked={locked} onDone={() => { setPickMedia(false); void load(); }} />
          ) : (
            <Button size="sm" disabled={locked || report.status === "TAKEN_DOWN"} onClick={() => setPickMedia(true)}>
              <Gavel size={14} className="mr-1.5" aria-hidden />
              {report.status === "TAKEN_DOWN" ? t("admin.moderation.detail.alreadyTakenDown") : t("admin.moderation.detail.takeDownFiles")}
            </Button>
          )}
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-5">
          <h3 className="text-sm font-semibold text-white">{t("admin.moderation.detail.dismissTitle")}</h3>
          <p className="mt-1 text-xs text-zinc-500">
            {t("admin.moderation.detail.dismissBody")}
          </p>
          <textarea
            value={dismissNote}
            onChange={(e) => setDismissNote(e.target.value)}
            maxLength={1000}
            rows={3}
            placeholder={t("admin.moderation.detail.dismissPlaceholder")}
            className="mt-3 w-full resize-y rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-sm text-white outline-none transition-colors placeholder:text-zinc-600 focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30"
          />
          <Button
            size="sm"
            variant="outline"
            className="mt-2"
            disabled={busy === "dismiss" || report.status === "TAKEN_DOWN"}
            onClick={() => void dismiss()}
          >
            {busy === "dismiss" ? <Loader2 size={14} className="mr-1.5 animate-spin" aria-hidden /> : null}
            {t("admin.moderation.detail.dismissButton")}
          </Button>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-5">
          <h3 className="text-sm font-semibold text-white">{t("admin.moderation.detail.counterTitle")}</h3>
          <p className="mt-1 text-xs text-zinc-500">
            {t("admin.moderation.detail.counterBody")}
          </p>
          <textarea
            value={counterText}
            onChange={(e) => setCounterText(e.target.value)}
            maxLength={2000}
            rows={3}
            placeholder={t("admin.moderation.detail.counterPlaceholder")}
            className="mt-3 w-full resize-y rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-sm text-white outline-none transition-colors placeholder:text-zinc-600 focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30"
          />
          <Button
            size="sm"
            variant="outline"
            className="mt-2"
            disabled={busy === "counter" || report.status === "COUNTER_NOTICE"}
            onClick={() => void recordCounter()}
          >
            {busy === "counter" ? <Loader2 size={14} className="mr-1.5 animate-spin" aria-hidden /> : null}
            {report.status === "COUNTER_NOTICE" ? t("admin.moderation.detail.counterButtonDone") : t("admin.moderation.detail.counterButton")}
          </Button>
        </div>

        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-5">
          <h3 className="text-sm font-semibold text-red-300">{t("admin.moderation.detail.deleteTitle")}</h3>
          <p className="mt-1 text-xs text-red-300/70">
            {t("admin.moderation.detail.deleteBody")}
          </p>
          <Button size="sm" variant="outline" className="mt-3 border-red-500/30 text-red-300 hover:bg-red-500/10 hover:text-red-200" disabled={busy === "delete" || locked} onClick={() => void remove()}>
            {busy === "delete" ? <Loader2 size={14} className="mr-1.5 animate-spin" aria-hidden /> : <Trash2 size={14} className="mr-1.5" aria-hidden />}
            {t("admin.moderation.detail.deleteButton")}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, mono, wide }: { label: string; value: string; mono?: boolean; wide?: boolean }) {
  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <dt className="text-[11px] uppercase tracking-wide text-zinc-500">{label}</dt>
      <dd className={`mt-0.5 break-words text-zinc-200 ${mono ? "font-mono text-xs" : ""}`}>{value}</dd>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Media search / takedown picker
 * ------------------------------------------------------------------------- */

type MediaRow = {
  id: string;
  kind: string;
  sha256: string;
  pHashHex: string;
  filePath: string;
  createdAt: string;
  profileId: string | null;
  profileSlug: string | null;
  owner: { userId: string; username: string };
  copyOwners: string[];
  copyCount: number;
  banned: boolean;
};

function MediaSearch({
  mode,
  reportId,
  locked,
  onDone,
}: {
  mode: "search" | "takedown";
  reportId?: string;
  locked: boolean;
  onDone?: () => void;
}) {
  const { t } = useTranslation("admin");
  const [sha256, setSha256] = useState("");
  const [username, setUsername] = useState("");
  const [kind, setKind] = useState("");
  // The applied values only change on "Search" or "page change", so typing in
  // the fields does not fire a request per keystroke.
  const [applied, setApplied] = useState<{ sha256: string; username: string; kind: string }>({
    sha256: "",
    username: "",
    kind: "",
  });
  const [files, setFiles] = useState<MediaRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [note, setNote] = useState("");
  // A report takedown historically disabled owners by default; a manual ban must
  // NOT silently lock people out, so the manual view starts with it off.
  const [disableAccount, setDisableAccount] = useState(mode === "takedown");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  // Per-row action spinner (delete a file, disable an owner).
  const [rowBusy, setRowBusy] = useState<string | null>(null);

  // Report-less operator tools (only shown in the standalone "search" view).
  const [hashSha, setHashSha] = useState("");
  const [hashPhash, setHashPhash] = useState("");
  const [hashNote, setHashNote] = useState("");
  const [hashBusy, setHashBusy] = useState(false);
  const [profileRef, setProfileRef] = useState("");
  const [profileNote, setProfileNote] = useState("");
  const [profileDisable, setProfileDisable] = useState(false);
  const [profileBusy, setProfileBusy] = useState(false);
  const [accountRef, setAccountRef] = useState("");
  const [accountReason, setAccountReason] = useState("");
  const [accountBusy, setAccountBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.searchAdminDmcaMedia({
        sha256: applied.sha256 || undefined,
        username: applied.username || undefined,
        kind: applied.kind || undefined,
        limit: 20,
        offset: page * 20,
      });
      if (!res.success || !res.data) {
        setError(res.error ?? t("admin.moderation.media.loadFailed"));
        return;
      }
      setFiles(res.data);
      setTotal(res.pagination?.total ?? 0);
    } catch {
      setError(t("admin.moderation.media.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [applied.sha256, applied.username, applied.kind, page, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const runSearch = () => {
    setApplied({ sha256: sha256.trim(), username: username.trim(), kind });
    setPage(0);
  };

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const selectAllShown = () => {
    setSelected(new Set(files.filter((f) => !f.banned).map((f) => f.id)));
  };

  /** Confirmation copy shared by both the report and manual takedown paths. */
  const takedownConfirm = (picked: MediaRow[]) => {
    const coveredAccounts = new Set<string>();
    for (const f of picked) coveredAccounts.add(f.owner.username);
    for (const f of picked) for (const o of f.copyOwners) coveredAccounts.add(o);
    return window.confirm(
      t("admin.moderation.media.confirm", {
        count: picked.length,
        s: picked.length === 1 ? "" : "s",
        accounts: coveredAccounts.size,
        owners: [...coveredAccounts].join(", "),
        disableLine: disableAccount
          ? t("admin.moderation.media.confirmDisable")
          : t("admin.moderation.media.confirmKeep"),
      })
    );
  };

  const describeResult = (r: { filesRemoved: number; hashesBanned: number; accountsDisabled: string[] }) =>
    t("admin.moderation.media.result", {
      files: r.filesRemoved,
      s: r.filesRemoved === 1 ? "" : "s",
      hashes: r.hashesBanned,
      es: r.hashesBanned === 1 ? "" : "es",
      accounts: r.accountsDisabled.length,
    });

  const execute = async () => {
    const ids = [...selected];
    const picked = files.filter((f) => ids.includes(f.id));
    if (!picked.length) return;
    if (!takedownConfirm(picked)) return;

    setBusy(true);
    setNotice(null);
    // A report takedown adopts the report (200 with a result); the manual one
    // has no report and accounts off unless the operator opted in.
    const res =
      mode === "takedown" && reportId
        ? await api.runAdminDmcaTakedown(reportId, { mediaFileIds: ids, note: note || undefined, disableAccount })
        : await api.runAdminDmcaManualTakedown({ mediaFileIds: ids, note: note || undefined, disableAccount });
    setBusy(false);
    if (!res.success || !res.data) {
      setNotice({ tone: "err", text: res.error ?? t("admin.moderation.media.executeFailed") });
      return;
    }
    setNotice({ tone: "ok", text: describeResult(res.data) });
    setSelected(new Set());
    await load();
    onDone?.();
  };

  /** Remove one stored copy only — the bytes are NOT banned. */
  const deleteFile = async (f: MediaRow) => {
    if (!window.confirm(t("admin.moderation.media.deleteConfirm", { filePath: f.filePath }))) {
      return;
    }
    setRowBusy(f.id);
    setNotice(null);
    const res = await api.deleteAdminDmcaMedia(f.id);
    setRowBusy(null);
    if (!res.success) {
      setNotice({ tone: "err", text: res.error ?? t("admin.moderation.media.deleteFailed") });
      return;
    }
    setNotice({ tone: "ok", text: t("admin.moderation.media.deleteNotice") });
    await load();
  };

  /** Disable one account (no takedown) with a recorded, appealable reason. */
  const disableOwner = async (f: MediaRow) => {
    const reason = window.prompt(
      t("admin.moderation.media.disableOwnerPrompt", { username: f.owner.username })
    );
    if (reason === null) return;
    if (!reason.trim()) {
      setNotice({ tone: "err", text: t("admin.moderation.media.disableOwnerReasonRequired") });
      return;
    }
    setRowBusy(f.id);
    setNotice(null);
    const res = await api.disableAdminDmcaUser(f.owner.userId, reason.trim());
    setRowBusy(null);
    if (!res.success) {
      setNotice({ tone: "err", text: res.error ?? t("admin.moderation.media.disableOwnerFailed") });
      return;
    }
    setNotice({ tone: "ok", text: t("admin.moderation.media.disableOwnerNotice", { username: f.owner.username }) });
    await load();
  };

  /** Take down every file owned by a profile's owner (by slug). */
  const takedownProfileRow = async (f: MediaRow) => {
    const slug = f.profileSlug;
    if (!slug) return;
    if (!window.confirm(t("admin.moderation.media.takeDownProfileRowConfirm", { username: f.owner.username, slug }))) {
      return;
    }
    setRowBusy(f.id);
    setNotice(null);
    const res = await api.takedownAdminDmcaProfile(slug, {});
    setRowBusy(null);
    if (!res.success || !res.data) {
      setNotice({ tone: "err", text: res.error ?? t("admin.moderation.manual.profileFailed") });
      return;
    }
    setNotice({ tone: "ok", text: t("admin.moderation.media.takeDownProfileRowResult", { slug, result: describeResult(res.data) }) });
    await load();
  };

  const banHashAction = async () => {
    if (!hashSha.trim()) {
      setNotice({ tone: "err", text: t("admin.moderation.manual.shaRequired") });
      return;
    }
    setHashBusy(true);
    setNotice(null);
    const res = await api.banAdminDmcaHash({
      sha256: hashSha.trim(),
      pHashHex: hashPhash.trim() || undefined,
      note: hashNote || undefined,
    });
    setHashBusy(false);
    if (!res.success) {
      setNotice({ tone: "err", text: res.error ?? t("admin.moderation.manual.banHashFailed") });
      return;
    }
    setHashSha("");
    setHashPhash("");
    setHashNote("");
    setNotice({ tone: "ok", text: t("admin.moderation.manual.banHashNotice") });
    await load();
  };

  const takeDownProfileForm = async () => {
    const ref = profileRef.trim();
    if (!ref) {
      setNotice({ tone: "err", text: t("admin.moderation.manual.profileRefRequired") });
      return;
    }
    if (
      !window.confirm(
        t("admin.moderation.manual.profileConfirm", {
          ref,
          disableLine: profileDisable
            ? t("admin.moderation.manual.profileConfirmDisable")
            : t("admin.moderation.manual.profileConfirmKeep"),
        })
      )
    ) {
      return;
    }
    setProfileBusy(true);
    setNotice(null);
    const res = await api.takedownAdminDmcaProfile(ref, {
      note: profileNote || undefined,
      disableAccount: profileDisable,
    });
    setProfileBusy(false);
    if (!res.success || !res.data) {
      setNotice({ tone: "err", text: res.error ?? t("admin.moderation.manual.profileFailed") });
      return;
    }
    setProfileRef("");
    setProfileNote("");
    setProfileDisable(false);
    setNotice({ tone: "ok", text: describeResult(res.data) });
    await load();
  };

  const disableAccountForm = async () => {
    const ref = accountRef.trim();
    if (!ref) {
      setNotice({ tone: "err", text: t("admin.moderation.manual.accountRefRequired") });
      return;
    }
    if (!accountReason.trim()) {
      setNotice({ tone: "err", text: t("admin.moderation.manual.reasonRequired") });
      return;
    }
    if (!window.confirm(t("admin.moderation.manual.accountConfirm", { ref }))) return;
    setAccountBusy(true);
    setNotice(null);
    const res = await api.disableAdminDmcaUser(ref, accountReason.trim());
    setAccountBusy(false);
    if (!res.success) {
      setNotice({ tone: "err", text: res.error ?? t("admin.moderation.manual.accountFailed") });
      return;
    }
    setAccountRef("");
    setAccountReason("");
    setNotice({ tone: "ok", text: t("admin.moderation.manual.accountNotice", { ref }) });
    await load();
  };

  const kindOptions = [
    "AVATAR",
    "BANNER",
    "LINK_ICON",
    "BACKGROUND",
    "MUSIC",
    "SHOP_PREVIEW",
    "SHOP_PRODUCT",
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex-1 min-w-[140px]">
          <span className="mb-1 block text-[11px] uppercase tracking-wide text-zinc-500">{t("admin.moderation.media.hash")}</span>
          <input
            value={sha256}
            onChange={(e) => setSha256(e.target.value)}
            placeholder={t("admin.moderation.media.hashPlaceholder")}
            className="w-full rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-xs font-mono text-white outline-none transition-colors placeholder:text-zinc-600 focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30"
          />
        </label>
        <label className="flex-1 min-w-[120px]">
          <span className="mb-1 block text-[11px] uppercase tracking-wide text-zinc-500">{t("admin.moderation.media.username")}</span>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder={t("admin.moderation.media.usernamePlaceholder")}
            className="w-full rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-xs text-white outline-none transition-colors placeholder:text-zinc-600 focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30"
          />
        </label>
        <label className="min-w-[130px]">
          <span className="mb-1 block text-[11px] uppercase tracking-wide text-zinc-500">{t("admin.moderation.media.kind")}</span>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            className="w-full rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-xs text-white outline-none transition-colors focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30"
          >
            <option value="">{t("admin.moderation.media.anyKind")}</option>
            {kindOptions.map((k) => (
              <option key={k} value={k}>
                {t(`admin.moderation.kinds.${k}`)}
              </option>
            ))}
          </select>
        </label>
        <Button size="sm" type="button" onClick={runSearch}>
          <Search size={14} className="mr-1.5" aria-hidden />
          {t("admin.moderation.media.search")}
        </Button>
      </div>

      {error ? (
        <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="text-sm text-zinc-500">{t("admin.moderation.media.loading")}</p>
      ) : files.length === 0 ? (
        <p className="text-sm text-zinc-500">{t("admin.moderation.media.empty")}</p>
      ) : (
        <ul className="space-y-2">
          {files.map((f) => (
            <li
              key={f.id}
              className="flex items-start gap-3 rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-3"
            >
              <input
                type="checkbox"
                checked={selected.has(f.id)}
                disabled={f.banned}
                onChange={() => toggle(f.id)}
                className="mt-1 accent-violet-500"
                aria-label={t("admin.moderation.media.selectFile", { filePath: f.filePath })}
              />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-sm text-white">
                  <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">{t(`admin.moderation.kinds.${f.kind}`)}</span>
                  <span className="text-xs text-zinc-400">@{f.owner.username}</span>
                  {f.profileSlug ? <span className="text-xs text-zinc-600">/u/{f.profileSlug}</span> : null}
                  {f.banned ? (
                    <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-xs font-medium text-red-400">
                      {t("admin.moderation.media.hashBanned")}
                    </span>
                  ) : null}
                </p>
                <p className="mt-1 truncate font-mono text-[11px] text-zinc-500">{f.filePath}</p>
                <p className="mt-0.5 text-[11px] text-zinc-600">
                  {t("admin.moderation.media.sha")} <span className="font-mono">{f.sha256.slice(0, 16)}…</span> · {t("admin.moderation.media.pHash")}{" "}
                  <span className="font-mono">{f.pHashHex.slice(0, 12)}…</span> ·{" "}
                  {formatDateTime(f.createdAt)}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <span
                  className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                    f.copyCount > 1 ? "bg-amber-500/15 text-amber-400" : "bg-zinc-800 text-zinc-500"
                  }`}
                  title={f.copyOwners.length > 0 ? t("admin.moderation.media.heldBy", { owners: f.copyOwners.join(", ") }) : undefined}
                >
                  {t("admin.moderation.media.copyCount", { count: f.copyCount, ies: f.copyCount === 1 ? "" : "ies" })}
                </span>
                {f.copyOwners.length > 0 ? (
                  <p className="mt-1 max-w-[160px] truncate text-[10px] text-zinc-600">
                    {f.copyOwners.join(", ")}
                  </p>
                ) : null}
                {mode === "search" ? (
                  <div className="mt-2 flex flex-wrap items-center justify-end gap-1.5">
                    <Button
                      size="sm"
                      variant="outline"
                      aria-label={t("admin.moderation.media.deleteRowLabel", { filePath: f.filePath })}
                      disabled={rowBusy === f.id || locked}
                      onClick={() => void deleteFile(f)}
                    >
                      {rowBusy === f.id ? <Loader2 size={13} className="mr-1 animate-spin" aria-hidden /> : <Trash2 size={13} className="mr-1" aria-hidden />}
                      {t("admin.moderation.media.deleteRow")}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      aria-label={t("admin.moderation.media.disableOwnerLabel", { username: f.owner.username })}
                      disabled={rowBusy === f.id || locked}
                      onClick={() => void disableOwner(f)}
                    >
                      <UserX size={13} className="mr-1" aria-hidden />
                      {t("admin.moderation.media.disableOwner")}
                    </Button>
                    {f.profileSlug ? (
                      <Button
                        size="sm"
                        variant="outline"
                        aria-label={t("admin.moderation.media.takeDownProfileRowLabel", { slug: f.profileSlug })}
                        disabled={rowBusy === f.id || locked}
                        onClick={() => void takedownProfileRow(f)}
                      >
                        <Gavel size={13} className="mr-1" aria-hidden />
                        {t("admin.moderation.media.takeDownProfileRow")}
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      <Pagination page={page} total={total} pageSize={20} onPage={setPage} loading={loading} />

      {(
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-5">
          <h3 className="text-sm font-semibold text-white">
            {mode === "takedown" ? t("admin.moderation.media.takeDownHeadingReport") : t("admin.moderation.media.takeDownHeadingSelected")}
          </h3>
          <p className="mt-1 text-xs text-zinc-500">
            {t("admin.moderation.media.takeDownSubtitle")}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-4">
            <Button size="sm" variant="outline" type="button" onClick={selectAllShown}>
              {t("admin.moderation.media.selectAll", { count: files.length })}
            </Button>
            <label className="flex items-center gap-2 text-xs text-zinc-400">
              <input
                type="checkbox"
                checked={disableAccount}
                onChange={(e) => setDisableAccount(e.target.checked)}
                className="accent-violet-500"
              />
              {t("admin.moderation.media.disableAccounts")}
            </label>
            <span className="ml-auto text-xs text-zinc-500">
              {t("admin.moderation.media.selectionSummary", { selected: selected.size, copies: fullCopyCount(files, selected) })}
            </span>
          </div>

          {selected.size > 0 && (
            <>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={1000}
                rows={2}
                placeholder={t("admin.moderation.media.notePlaceholder")}
                className="mt-3 w-full resize-y rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-sm text-white outline-none transition-colors placeholder:text-zinc-600 focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30"
              />
              <Button
                size="sm"
                className="mt-3 bg-red-600 hover:bg-red-500"
                disabled={busy || locked}
                onClick={() => void execute()}
              >
                {busy ? <Loader2 size={14} className="mr-1.5 animate-spin" aria-hidden /> : <Gavel size={14} className="mr-1.5" aria-hidden />}
                {t("admin.moderation.media.execute")}
              </Button>
            </>
          )}
          {notice ? (
            <p
              role="status"
              className={`mt-3 rounded-lg border px-4 py-3 text-sm ${
                notice.tone === "ok"
                  ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
                  : "border-red-500/20 bg-red-500/10 text-red-400"
              }`}
            >
              {notice.text}
            </p>
          ) : null}
        </div>
      )}

      {mode === "search" ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-5">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
              <Hash size={15} className="text-zinc-400" aria-hidden />
              {t("admin.moderation.manual.banHashTitle")}
            </h3>
            <p className="mt-1 text-xs text-zinc-500">
              {t("admin.moderation.manual.banHashBody")}
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <label className="sm:col-span-2">
                <span className="mb-1 block text-[11px] uppercase tracking-wide text-zinc-500">{t("admin.moderation.manual.sha256Label")}</span>
                <input
                  value={hashSha}
                  onChange={(e) => setHashSha(e.target.value)}
                  placeholder={t("admin.moderation.manual.sha256Placeholder")}
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2 font-mono text-xs text-white outline-none transition-colors placeholder:text-zinc-600 focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30"
                />
              </label>
              <label>
                <span className="mb-1 block text-[11px] uppercase tracking-wide text-zinc-500">{t("admin.moderation.manual.pHashLabel")}</span>
                <input
                  value={hashPhash}
                  onChange={(e) => setHashPhash(e.target.value)}
                  placeholder={t("admin.moderation.manual.pHashPlaceholder")}
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2 font-mono text-xs text-white outline-none transition-colors placeholder:text-zinc-600 focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30"
                />
              </label>
              <label>
                <span className="mb-1 block text-[11px] uppercase tracking-wide text-zinc-500">{t("admin.moderation.manual.noteLabel")}</span>
                <input
                  value={hashNote}
                  onChange={(e) => setHashNote(e.target.value)}
                  maxLength={1000}
                  placeholder={t("admin.moderation.manual.notePlaceholder")}
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-xs text-white outline-none transition-colors placeholder:text-zinc-600 focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30"
                />
              </label>
            </div>
            <Button size="sm" className="mt-3" disabled={hashBusy || locked} onClick={() => void banHashAction()}>
              {hashBusy ? <Loader2 size={14} className="mr-1.5 animate-spin" aria-hidden /> : <Ban size={14} className="mr-1.5" aria-hidden />}
              {t("admin.moderation.manual.banHashButton")}
            </Button>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-5">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
              <Gavel size={15} className="text-zinc-400" aria-hidden />
              {t("admin.moderation.manual.profileTitle")}
            </h3>
            <p className="mt-1 text-xs text-zinc-500">
              {t("admin.moderation.manual.profileBody")}
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <label>
                <span className="mb-1 block text-[11px] uppercase tracking-wide text-zinc-500">{t("admin.moderation.manual.profileRefLabel")}</span>
                <input
                  value={profileRef}
                  onChange={(e) => setProfileRef(e.target.value)}
                  placeholder={t("admin.moderation.manual.profileRefPlaceholder")}
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-xs text-white outline-none transition-colors placeholder:text-zinc-600 focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30"
                />
              </label>
              <label>
                <span className="mb-1 block text-[11px] uppercase tracking-wide text-zinc-500">{t("admin.moderation.manual.noteLabel")}</span>
                <input
                  value={profileNote}
                  onChange={(e) => setProfileNote(e.target.value)}
                  maxLength={1000}
                  placeholder={t("admin.moderation.manual.profileNotePlaceholder")}
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-xs text-white outline-none transition-colors placeholder:text-zinc-600 focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30"
                />
              </label>
            </div>
            <label className="mt-2 flex items-center gap-2 text-xs text-zinc-400">
              <input
                type="checkbox"
                checked={profileDisable}
                onChange={(e) => setProfileDisable(e.target.checked)}
                className="accent-violet-500"
              />
              {t("admin.moderation.manual.profileDisable")}
            </label>
            <Button
              size="sm"
              className="mt-3 bg-red-600 hover:bg-red-500"
              disabled={profileBusy || locked}
              onClick={() => void takeDownProfileForm()}
            >
              {profileBusy ? <Loader2 size={14} className="mr-1.5 animate-spin" aria-hidden /> : <Gavel size={14} className="mr-1.5" aria-hidden />}
              {t("admin.moderation.manual.profileButton")}
            </Button>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-5">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
              <UserX size={15} className="text-zinc-400" aria-hidden />
              {t("admin.moderation.manual.disableTitle")}
            </h3>
            <p className="mt-1 text-xs text-zinc-500">
              {t("admin.moderation.manual.disableBody")}
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <label>
                <span className="mb-1 block text-[11px] uppercase tracking-wide text-zinc-500">{t("admin.moderation.manual.accountRefLabel")}</span>
                <input
                  value={accountRef}
                  onChange={(e) => setAccountRef(e.target.value)}
                  placeholder={t("admin.moderation.manual.accountRefPlaceholder")}
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-xs text-white outline-none transition-colors placeholder:text-zinc-600 focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30"
                />
              </label>
              <label>
                <span className="mb-1 block text-[11px] uppercase tracking-wide text-zinc-500">{t("admin.moderation.manual.accountReasonLabel")}</span>
                <input
                  value={accountReason}
                  onChange={(e) => setAccountReason(e.target.value)}
                  maxLength={1000}
                  placeholder={t("admin.moderation.manual.accountReasonPlaceholder")}
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-xs text-white outline-none transition-colors placeholder:text-zinc-600 focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30"
                />
              </label>
            </div>
            <Button size="sm" className="mt-3 bg-red-600 hover:bg-red-500" disabled={accountBusy || locked} onClick={() => void disableAccountForm()}>
              {accountBusy ? <Loader2 size={14} className="mr-1.5 animate-spin" aria-hidden /> : <UserX size={14} className="mr-1.5" aria-hidden />}
              {t("admin.moderation.manual.accountButton")}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Total copies across all still-selected rows, counting each selected row once. */
function fullCopyCount(files: MediaRow[], selected: Set<string>): number {
  return files.filter((f) => selected.has(f.id)).reduce((sum, f) => sum + f.copyCount, 0);
}

/* ---------------------------------------------------------------------------
 * Banned hashes
 * ------------------------------------------------------------------------- */

type HashRow = {
  id: string;
  sha256: string;
  pHashHex: string;
  reason: string | null;
  bannedAt: string;
  unbannedAt: string | null;
  dmcaReportId: string | null;
  bannedBy: { username: string } | null;
  unbannedBy: { username: string } | null;
  active: boolean;
};

function HashesPanel({ locked }: { locked: boolean }) {
  const { t } = useTranslation("admin");
  const [showActive, setShowActive] = useState(true);
  const [hashes, setHashes] = useState<HashRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getAdminDmcaHashes(showActive);
      if (!res.success || !res.data) {
        setError(res.error ?? t("admin.moderation.hashes.loadFailed"));
        return;
      }
      setHashes(res.data);
      setTotal(res.pagination?.total ?? 0);
    } catch {
      setError(t("admin.moderation.hashes.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [showActive, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const lift = async (id: string) => {
    if (!window.confirm(t("admin.moderation.hashes.unbanConfirm"))) {
      return;
    }
    setBusyId(id);
    setNotice(null);
    const res = await api.liftAdminDmcaHashBan(id);
    setBusyId(null);
    if (!res.success) {
      setNotice({ tone: "err", text: res.error ?? t("admin.moderation.hashes.liftFailed") });
      return;
    }
    setNotice({ tone: "ok", text: t("admin.moderation.hashes.liftedNotice") });
    await load();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setShowActive(true)}
          className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
            showActive ? "bg-red-500/15 text-red-400" : "bg-zinc-800/70 text-zinc-400 hover:text-zinc-200"
          }`}
        >
          {t("admin.moderation.hashes.activeTab", { total })}
        </button>
        <button
          type="button"
          onClick={() => setShowActive(false)}
          className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
            !showActive ? "bg-zinc-700/60 text-zinc-200" : "bg-zinc-800/70 text-zinc-400 hover:text-zinc-200"
          }`}
        >
          {t("admin.moderation.hashes.historyTab")}
        </button>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-zinc-400 transition-colors hover:bg-white/5 hover:text-white disabled:opacity-60"
        >
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} aria-hidden />
          {t("admin.moderation.hashes.refresh")}
        </button>
      </div>

      {notice ? (
        <p
          role="status"
          className={`rounded-lg border px-4 py-3 text-sm ${
            notice.tone === "ok"
              ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
              : "border-red-500/20 bg-red-500/10 text-red-400"
          }`}
        >
          {notice.text}
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="text-sm text-zinc-500">{t("admin.moderation.hashes.loading")}</p>
      ) : hashes.length === 0 ? (
        <p className="text-sm text-zinc-500">
          {showActive ? t("admin.moderation.hashes.emptyActive") : t("admin.moderation.hashes.emptyHistory")}
        </p>
      ) : (
        <ul className="space-y-2">
          {hashes.map((h) => (
            <li
              key={h.id}
              className="flex flex-wrap items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-3 text-xs"
            >
              <span className="font-mono text-zinc-200">{h.sha256.slice(0, 20)}…</span>
              <span className={`rounded-full px-2 py-0.5 font-medium ${h.active ? "bg-red-500/15 text-red-400" : "bg-zinc-700/40 text-zinc-400"}`}>
                {h.active ? t("admin.moderation.hashes.activeLabel") : t("admin.moderation.hashes.lifted")}
              </span>
              <span className="text-zinc-500">
                {t("admin.moderation.hashes.since", { date: formatDateTime(h.bannedAt) })}
                {h.bannedBy ? t("admin.moderation.hashes.byUser", { username: h.bannedBy.username }) : ""}
                {h.unbannedAt ? t("admin.moderation.hashes.liftedAt", { date: formatDateTime(h.unbannedAt) }) : ""}
                {h.unbannedBy ? t("admin.moderation.hashes.byUser", { username: h.unbannedBy.username }) : ""}
              </span>
              {h.reason && <span className="max-w-[280px] truncate text-zinc-600">· {h.reason}</span>}
              {h.active && (
                <span className="ml-auto">
                  <Button size="sm" variant="outline" disabled={busyId === h.id || locked} onClick={() => void lift(h.id)}>
                    {busyId === h.id ? <Loader2 size={13} className="mr-1 animate-spin" aria-hidden /> : <Ban size={13} className="mr-1" aria-hidden />}
                    {t("admin.moderation.hashes.unban")}
                  </Button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      <p className="flex items-start gap-2 text-xs text-zinc-500">
        <ShieldCheck size={13} className="mt-0.5 shrink-0" aria-hidden />
        {t("admin.moderation.hashes.footer")}
      </p>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Disabled accounts
 * ------------------------------------------------------------------------- */

type DisabledRow = {
  id: string;
  username: string;
  email: string;
  disabledAt: string;
  disabledReason: string | null;
  appealSubmittedAt: string | null;
  appealReviewedAt: string | null;
  appealDecision: string | null;
  reportsFiled: number;
};

function DisabledPanel({ locked }: { locked: boolean }) {
  const { t } = useTranslation("admin");
  const [users, setUsers] = useState<DisabledRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getAdminDmcaDisabled();
      if (!res.success || !res.data) {
        setError(res.error ?? t("admin.moderation.disabled.loadFailed"));
        return;
      }
      setUsers(res.data);
      setTotal(res.pagination?.total ?? 0);
    } catch {
      setError(t("admin.moderation.disabled.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const reactivate = async (user: DisabledRow) => {
    const decision = window.prompt(
      t("admin.moderation.disabled.reactivatePrompt", { username: user.username })
    );
    if (decision === null) return;
    if (!decision.trim()) {
      setNotice({ tone: "err", text: t("admin.moderation.disabled.decisionRequired") });
      return;
    }
    setBusyId(user.id);
    setNotice(null);
    const res = await api.reactivateAdminDmcaUser(user.id, decision.trim());
    setBusyId(null);
    if (!res.success) {
      setNotice({ tone: "err", text: res.error ?? t("admin.moderation.disabled.reactivateFailed") });
      return;
    }
    setNotice({ tone: "ok", text: t("admin.moderation.disabled.reactivated", { username: user.username }) });
    await load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-zinc-500">
          {t("admin.moderation.disabled.count", { count: total, s: total === 1 ? "" : "s" })}
        </span>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-zinc-400 transition-colors hover:bg-white/5 hover:text-white disabled:opacity-60"
        >
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} aria-hidden />
          {t("admin.moderation.disabled.refresh")}
        </button>
      </div>

      {notice ? (
        <p
          role="status"
          className={`rounded-lg border px-4 py-3 text-sm ${
            notice.tone === "ok"
              ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
              : "border-red-500/20 bg-red-500/10 text-red-400"
          }`}
        >
          {notice.text}
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="text-sm text-zinc-500">{t("admin.moderation.disabled.loading")}</p>
      ) : users.length === 0 ? (
        <p className="text-sm text-zinc-500">{t("admin.moderation.disabled.empty")}</p>
      ) : (
        <ul className="space-y-2">
          {users.map((u) => (
            <li
              key={u.id}
              className="flex flex-col gap-2 rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 text-sm text-white">
                  <span className="font-medium">@{u.username}</span>
                  <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">
                    {u.disabledReason ?? t("admin.moderation.disabled.unspecified")}
                  </span>
                  {u.appealSubmittedAt ? (
                    <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-xs font-medium text-sky-400">
                      {t("admin.moderation.disabled.hasAppeal")}
                    </span>
                  ) : null}
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  {t("admin.moderation.disabled.meta", {
                    email: u.email,
                    date: formatDateTime(u.disabledAt),
                    reports: u.reportsFiled,
                    s: u.reportsFiled === 1 ? "" : "s",
                  })}
                </p>
                {u.appealSubmittedAt ? (
                  <p className="mt-0.5 text-[11px] text-zinc-600">
                    {t("admin.moderation.disabled.appeal", { date: formatDateTime(u.appealSubmittedAt) })}
                    {u.appealReviewedAt ? ` · ${t("admin.moderation.disabled.appealReviewed", { date: formatDateTime(u.appealReviewedAt) })}` : ` · ${t("admin.moderation.disabled.appealNotReviewed")}`}
                    {u.appealDecision ? ` · ${t("admin.moderation.disabled.appealDecision", { decision: u.appealDecision })}` : ""}
                  </p>
                ) : null}
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={busyId === u.id || locked}
                onClick={() => void reactivate(u)}
                className="shrink-0"
              >
                {busyId === u.id ? <Loader2 size={14} className="mr-1.5 animate-spin" aria-hidden /> : <UserX size={14} className="mr-1.5" aria-hidden />}
                {t("admin.moderation.disabled.reactivate")}
              </Button>
            </li>
          ))}
        </ul>
      )}

      <p className="flex items-start gap-2 text-xs text-zinc-500">
        <CheckCircle2 size={13} className="mt-0.5 shrink-0" aria-hidden />
        {t("admin.moderation.disabled.footer")}
      </p>
    </div>
  );
}