import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, type DmcaStatus } from "@/lib/api";
import { Button } from "@/components/ui/button";
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
  const [view, setView] = useState<SubView>("queue");
  const [detailId, setDetailId] = useState<string | null>(null);

  const tabs: Array<{ value: SubView; label: string }> = [
    { value: "queue", label: "Report queue" },
    { value: "media", label: "Media search" },
    { value: "hashes", label: "Banned hashes" },
    { value: "disabled", label: "Disabled accounts" },
  ];

  return (
    <section className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Gavel size={18} className="text-violet-400" />
          <h2 className="text-lg font-semibold text-white">DMCA moderation</h2>
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
        setError(res.error ?? "Could not load reports");
        return;
      }
      // Rows are `data`; `counts`/`pagination` are siblings (see api.ts ApiResponse).
      setReports(res.data);
      setCounts((res.counts as Record<DmcaStatus, number> | undefined) ?? null);
      setTotal(res.pagination?.total ?? 0);
    } catch {
      setError("Could not load reports");
    } finally {
      setLoading(false);
    }
  }, [status, appliedQ, page]);

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
            {s.replace("_", " ")} · {counts ? counts[s] : "…"}
          </button>
        ))}
        <span className="ml-auto text-xs text-zinc-500">{total} report{total === 1 ? "" : "s"}</span>
      </div>

      <form onSubmit={submitSearch} className="flex gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search claimant name, email or work URL…"
          className="w-full rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-2 text-sm text-white outline-none transition-colors placeholder:text-zinc-600 focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30"
        />
        <Button type="submit" variant="outline" className="shrink-0">
          <Search size={14} className="mr-1.5" aria-hidden />
          Search
        </Button>
      </form>

      {error ? (
        <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="text-sm text-zinc-500">Loading reports…</p>
      ) : reports.length === 0 ? (
        <p className="text-sm text-zinc-500">No reports match these filters.</p>
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
                    {r.status.replace("_", " ")}
                  </span>
                  {r.activeHashes > 0 && (
                    <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-400">
                      {r.activeHashes} active ban{r.activeHashes === 1 ? "" : "s"}
                    </span>
                  )}
                </p>
                <p className="mt-1 truncate text-xs text-zinc-500">
                  {r.claimantEmail} ·{" "}
                  <span className="font-mono text-zinc-600">{(r.workUrl || "no work URL").slice(0, 60)}</span>
                  {r.filedBy ? ` · filed by ${r.filedBy}` : " · filed by guest"}
                </p>
                <p className="mt-0.5 text-[11px] text-zinc-600">
                  {new Date(r.createdAt).toLocaleString()}
                  {r.handledAt ? ` · handled ${new Date(r.handledAt).toLocaleString()}` : ""}
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={() => onOpen(r.id)}>
                <Eye size={14} className="mr-1.5" aria-hidden />
                Review
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
        setError(res.error ?? "Could not load the report");
        return;
      }
      setReport(res.data);
    } catch {
      setError("Could not load the report");
    } finally {
      setLoading(false);
    }
  }, [reportId]);

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
      setNotice({ tone: "err", text: res.error ?? "Could not dismiss the report" });
      return;
    }
    // reset() also clears `notice`, so it must run BEFORE the success notice;
    // otherwise the OK banner is wiped in the same render batch and never shows.
    reset();
    setNotice({ tone: "ok", text: "Report dismissed. The claimant has been emailed the outcome." });
    await load();
  };

  const recordCounter = async () => {
    setBusy("counter");
    setNotice(null);
    const res = await api.recordAdminDmcaCounterNotice(reportId, counterText);
    setBusy(null);
    if (!res.success) {
      setNotice({ tone: "err", text: res.error ?? "Could not record the counter-notice" });
      return;
    }
    // See dismiss(): reset() clears `notice`, so it must precede the toast.
    reset();
    setNotice({ tone: "ok", text: "Counter-notice recorded. Hash bans lifted; accounts stay disabled until reviewed." });
    await load();
  };

  const remove = async () => {
    const ok = window.confirm(
      "Deleting this report permanently removes it — the claimant's record is gone.\n\n" +
        "Its hashes are un-banned first, so a hash ban is NOT kept after deleting the report.\n\n" +
        "Continue?"
    );
    if (!ok) return;
    setBusy("delete");
    setNotice(null);
    const res = await api.deleteAdminDmcaReport(reportId);
    setBusy(null);
    if (!res.success) {
      setNotice({ tone: "err", text: res.error ?? "Could not delete the report" });
      return;
    }
    onBack();
  };

  if (loading) return <p className="text-sm text-zinc-500">Loading report…</p>;
  if (error || !report) {
    return (
      <div className="space-y-3">
        <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </p>
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft size={14} className="mr-1.5" aria-hidden />
          Back to queue
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Button variant="outline" size="sm" onClick={onBack}>
          <ArrowLeft size={14} className="mr-1.5" aria-hidden />
          Queue
        </Button>
        <span className={`rounded-full px-3 py-1 text-xs font-medium ${statusClass(report.status)}`}>
          {report.status.replace("_", " ")}
        </span>
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-5">
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <Field label="Claimant" value={`${report.claimantName} <${report.claimantEmail}>`} />
          <Field label="Work URL" value={report.workUrl || "—"} mono />
          <Field label="Filed" value={new Date(report.createdAt).toLocaleString()} />
          <Field
            label="Filed by"
            value={report.filedByUser ? `@${report.filedByUser.username}` : "Guest (not signed into an account)"}
          />
          {report.handledAt ? (
            <Field label="Handled" value={`${new Date(report.handledAt).toLocaleString()}${report.handledBy ? ` by @${report.handledBy.username}` : ""}`} />
          ) : null}
          {report.decisionNote ? <Field label="Decision note" value={report.decisionNote} wide /> : null}
        </dl>

        <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-zinc-500">Description</p>
        <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-300">{report.description || "—"}</p>

        {report.infringingUrls.length > 0 ? (
          <>
            <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Infringing URLs reported
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
            <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-zinc-500">Contact note</p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-300">{report.contactNote}</p>
          </>
        ) : null}

        {report.counterNotice ? (
          <div className="mt-4 rounded-lg border border-sky-500/20 bg-sky-500/5 px-4 py-3">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-sky-400">
              <Scale size={13} aria-hidden /> Counter-notice
              {report.counterNoticeAt ? ` · ${new Date(report.counterNoticeAt).toLocaleString()}` : ""}
            </p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-300">{report.counterNotice}</p>
          </div>
        ) : null}
      </div>

      {report.hashes.length > 0 ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-5">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
            <Hash size={15} className="text-zinc-400" aria-hidden />
            Hash bans on this report
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
                  {h.unbannedAt ? "un-banned" : "active ban"}
                </span>
                {h.unbannedAt ? (
                  <span className="text-zinc-500">
                    lifted {new Date(h.unbannedAt).toLocaleString()}
                    {h.unbannedBy ? ` by @${h.unbannedBy.username}` : ""}
                  </span>
                ) : (
                  <span className="text-zinc-500">
                    since {new Date(h.bannedAt).toLocaleString()}
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
          <h3 className="text-sm font-semibold text-white">Take down</h3>
          <p className="mt-1 text-xs text-zinc-500">
            Pick the reported files. Every account's copy of the same bytes is removed, the hashes are
            banned, and the owners' accounts are disabled.
          </p>
          {pickMedia ? (
            <MediaSearch mode="takedown" reportId={reportId} locked={locked} onDone={() => { setPickMedia(false); void load(); }} />
          ) : (
            <Button size="sm" disabled={locked || report.status === "TAKEN_DOWN"} onClick={() => setPickMedia(true)}>
              <Gavel size={14} className="mr-1.5" aria-hidden />
              {report.status === "TAKEN_DOWN" ? "Already taken down" : "Take down files"}
            </Button>
          )}
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-5">
          <h3 className="text-sm font-semibold text-white">Dismiss</h3>
          <p className="mt-1 text-xs text-zinc-500">
            Records the decision as no action needed. The claimant is emailed the outcome.
          </p>
          <textarea
            value={dismissNote}
            onChange={(e) => setDismissNote(e.target.value)}
            maxLength={1000}
            rows={3}
            placeholder="Why is no action being taken?"
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
            Dismiss report
          </Button>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-5">
          <h3 className="text-sm font-semibold text-white">Counter-notice</h3>
          <p className="mt-1 text-xs text-zinc-500">
            The reported party disputes the claim. Their hash bans are lifted, but their accounts stay
            disabled until you re-activate them on the Disabled accounts view.
          </p>
          <textarea
            value={counterText}
            onChange={(e) => setCounterText(e.target.value)}
            maxLength={2000}
            rows={3}
            placeholder="Paste the counter-notice text here."
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
            {report.status === "COUNTER_NOTICE" ? "Counter-notice recorded" : "Record counter-notice"}
          </Button>
        </div>

        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-5">
          <h3 className="text-sm font-semibold text-red-300">Delete permanently</h3>
          <p className="mt-1 text-xs text-red-300/70">
            Removes the report row entirely. Its hashes are un-banned first, so this is not a way to keep
            a ban alive. Use it only for junk or mistaken filings.
          </p>
          <Button size="sm" variant="outline" className="mt-3 border-red-500/30 text-red-300 hover:bg-red-500/10 hover:text-red-200" disabled={busy === "delete" || locked} onClick={() => void remove()}>
            {busy === "delete" ? <Loader2 size={14} className="mr-1.5 animate-spin" aria-hidden /> : <Trash2 size={14} className="mr-1.5" aria-hidden />}
            Delete report
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
        setError(res.error ?? "Could not search media");
        return;
      }
      setFiles(res.data);
      setTotal(res.pagination?.total ?? 0);
    } catch {
      setError("Could not search media");
    } finally {
      setLoading(false);
    }
  }, [applied.sha256, applied.username, applied.kind, page]);

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
      `Take down ${picked.length} file${picked.length === 1 ? "" : "s"}?\n\n` +
        `Every account holding the same bytes is affected — automatic expansion covers ` +
        `${coveredAccounts.size} account${coveredAccounts.size === 1 ? "" : "s"} in total:` +
        `\n\n${[...coveredAccounts].join(", ")}\n\n` +
        `${disableAccount ? "Their accounts will be DISABLED." : "Accounts will NOT be disabled."}\n\n` +
        `This cannot be undone. Continue?`
    );
  };

  const describeResult = (r: { filesRemoved: number; hashesBanned: number; accountsDisabled: string[] }) =>
    `Removed ${r.filesRemoved} file${r.filesRemoved === 1 ? "" : "s"}, banned ${r.hashesBanned} hash${
      r.hashesBanned === 1 ? "" : "es"
    } and disabled ${r.accountsDisabled.length} account${r.accountsDisabled.length === 1 ? "" : "s"}.`;

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
      setNotice({ tone: "err", text: res.error ?? "Could not run the takedown" });
      return;
    }
    setNotice({ tone: "ok", text: describeResult(res.data) });
    setSelected(new Set());
    await load();
    onDone?.();
  };

  /** Remove one stored copy only — the bytes are NOT banned. */
  const deleteFile = async (f: MediaRow) => {
    if (
      !window.confirm(
        `Delete this single file?\n\n${f.filePath}\n\nOnly this copy is removed — the bytes are NOT banned, so it can be uploaded again.`
      )
    ) {
      return;
    }
    setRowBusy(f.id);
    setNotice(null);
    const res = await api.deleteAdminDmcaMedia(f.id);
    setRowBusy(null);
    if (!res.success) {
      setNotice({ tone: "err", text: res.error ?? "Could not delete the file" });
      return;
    }
    setNotice({ tone: "ok", text: "File deleted." });
    await load();
  };

  /** Disable one account (no takedown) with a recorded, appealable reason. */
  const disableOwner = async (f: MediaRow) => {
    const reason = window.prompt(
      `Reason for disabling @${f.owner.username}. It is recorded on the account and the user can appeal.`
    );
    if (reason === null) return;
    if (!reason.trim()) {
      setNotice({ tone: "err", text: "A reason is required." });
      return;
    }
    setRowBusy(f.id);
    setNotice(null);
    const res = await api.disableAdminDmcaUser(f.owner.userId, reason.trim());
    setRowBusy(null);
    if (!res.success) {
      setNotice({ tone: "err", text: res.error ?? "Could not disable the account" });
      return;
    }
    setNotice({ tone: "ok", text: `@${f.owner.username} disabled.` });
    await load();
  };

  /** Take down every file owned by a profile's owner (by slug). */
  const takedownProfileRow = async (f: MediaRow) => {
    const slug = f.profileSlug;
    if (!slug) return;
    if (
      !window.confirm(
        `Take down EVERY media file owned by @${f.owner.username} (profile /u/${slug})?\n\n` +
          `All their uploads are removed and their hashes banned. Their account stays enabled.\n\n` +
          `This cannot be undone. Continue?`
      )
    ) {
      return;
    }
    setRowBusy(f.id);
    setNotice(null);
    const res = await api.takedownAdminDmcaProfile(slug, {});
    setRowBusy(null);
    if (!res.success || !res.data) {
      setNotice({ tone: "err", text: res.error ?? "Could not take down the profile" });
      return;
    }
    setNotice({ tone: "ok", text: `Profile /u/${slug}: ${describeResult(res.data)}` });
    await load();
  };

  const banHashAction = async () => {
    if (!hashSha.trim()) {
      setNotice({ tone: "err", text: "A SHA-256 hash is required." });
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
      setNotice({ tone: "err", text: res.error ?? "Could not ban the hash" });
      return;
    }
    setHashSha("");
    setHashPhash("");
    setHashNote("");
    setNotice({ tone: "ok", text: "Hash banned." });
    await load();
  };

  const takeDownProfileForm = async () => {
    const ref = profileRef.trim();
    if (!ref) {
      setNotice({ tone: "err", text: "A profile slug or id is required." });
      return;
    }
    if (
      !window.confirm(
        `Take down EVERY media file owned by profile "${ref}"?` +
          (profileDisable ? "\n\nTheir account will be DISABLED." : "\n\nTheir account stays enabled.") +
          "\n\nThis cannot be undone. Continue?"
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
      setNotice({ tone: "err", text: res.error ?? "Could not take down the profile" });
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
      setNotice({ tone: "err", text: "A username or user id is required." });
      return;
    }
    if (!accountReason.trim()) {
      setNotice({ tone: "err", text: "A reason is required." });
      return;
    }
    if (!window.confirm(`Disable the account "${ref}"?\n\nThey can appeal. Continue?`)) return;
    setAccountBusy(true);
    setNotice(null);
    const res = await api.disableAdminDmcaUser(ref, accountReason.trim());
    setAccountBusy(false);
    if (!res.success) {
      setNotice({ tone: "err", text: res.error ?? "Could not disable the account" });
      return;
    }
    setAccountRef("");
    setAccountReason("");
    setNotice({ tone: "ok", text: `Account "${ref}" disabled.` });
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
          <span className="mb-1 block text-[11px] uppercase tracking-wide text-zinc-500">Hash (sha256)</span>
          <input
            value={sha256}
            onChange={(e) => setSha256(e.target.value)}
            placeholder="e.g. 0000000000000000…"
            className="w-full rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-xs font-mono text-white outline-none transition-colors placeholder:text-zinc-600 focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30"
          />
        </label>
        <label className="flex-1 min-w-[120px]">
          <span className="mb-1 block text-[11px] uppercase tracking-wide text-zinc-500">Username</span>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="@alice"
            className="w-full rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-xs text-white outline-none transition-colors placeholder:text-zinc-600 focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30"
          />
        </label>
        <label className="min-w-[130px]">
          <span className="mb-1 block text-[11px] uppercase tracking-wide text-zinc-500">Kind</span>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            className="w-full rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-xs text-white outline-none transition-colors focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30"
          >
            <option value="">Any kind</option>
            {kindOptions.map((k) => (
              <option key={k} value={k}>
                {k.replace("_", " ")}
              </option>
            ))}
          </select>
        </label>
        <Button size="sm" type="button" onClick={runSearch}>
          <Search size={14} className="mr-1.5" aria-hidden />
          Search
        </Button>
      </div>

      {error ? (
        <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="text-sm text-zinc-500">Searching media…</p>
      ) : files.length === 0 ? (
        <p className="text-sm text-zinc-500">No media files match. Try a username or check the hash.</p>
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
                aria-label={`Select ${f.filePath}`}
              />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-sm text-white">
                  <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">{f.kind.replace("_", " ")}</span>
                  <span className="text-xs text-zinc-400">@{f.owner.username}</span>
                  {f.profileSlug ? <span className="text-xs text-zinc-600">/u/{f.profileSlug}</span> : null}
                  {f.banned ? (
                    <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-xs font-medium text-red-400">
                      hash banned
                    </span>
                  ) : null}
                </p>
                <p className="mt-1 truncate font-mono text-[11px] text-zinc-500">{f.filePath}</p>
                <p className="mt-0.5 text-[11px] text-zinc-600">
                  sha <span className="font-mono">{f.sha256.slice(0, 16)}…</span> · pHash{" "}
                  <span className="font-mono">{f.pHashHex.slice(0, 12)}…</span> ·{" "}
                  {new Date(f.createdAt).toLocaleString()}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <span
                  className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                    f.copyCount > 1 ? "bg-amber-500/15 text-amber-400" : "bg-zinc-800 text-zinc-500"
                  }`}
                  title={f.copyOwners.length > 0 ? `Held by: ${f.copyOwners.join(", ")}` : undefined}
                >
                  {f.copyCount} copy{f.copyCount === 1 ? "" : "ies"}
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
                      aria-label={`Delete ${f.filePath}`}
                      disabled={rowBusy === f.id || locked}
                      onClick={() => void deleteFile(f)}
                    >
                      {rowBusy === f.id ? <Loader2 size={13} className="mr-1 animate-spin" aria-hidden /> : <Trash2 size={13} className="mr-1" aria-hidden />}
                      Delete
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      aria-label={`Disable owner ${f.owner.username}`}
                      disabled={rowBusy === f.id || locked}
                      onClick={() => void disableOwner(f)}
                    >
                      <UserX size={13} className="mr-1" aria-hidden />
                      Disable owner
                    </Button>
                    {f.profileSlug ? (
                      <Button
                        size="sm"
                        variant="outline"
                        aria-label={`Take down profile ${f.profileSlug}`}
                        disabled={rowBusy === f.id || locked}
                        onClick={() => void takedownProfileRow(f)}
                      >
                        <Gavel size={13} className="mr-1" aria-hidden />
                        Take down profile
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
            {mode === "takedown" ? "Take down the reported files" : "Take down the selected files"}
          </h3>
          <p className="mt-1 text-xs text-zinc-500">
            Every account holding the same bytes is affected. Accounts are disabled only when you tick the box below.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-4">
            <Button size="sm" variant="outline" type="button" onClick={selectAllShown}>
              Select all {files.length} shown
            </Button>
            <label className="flex items-center gap-2 text-xs text-zinc-400">
              <input
                type="checkbox"
                checked={disableAccount}
                onChange={(e) => setDisableAccount(e.target.checked)}
                className="accent-violet-500"
              />
              Disable the owners' accounts
            </label>
            <span className="ml-auto text-xs text-zinc-500">
              {selected.size} selected · {fullCopyCount(files, selected)} affected copy(-ies)
            </span>
          </div>

          {selected.size > 0 && (
            <>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={1000}
                rows={2}
                placeholder="Optional note recorded with the decision."
                className="mt-3 w-full resize-y rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-sm text-white outline-none transition-colors placeholder:text-zinc-600 focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30"
              />
              <Button
                size="sm"
                className="mt-3 bg-red-600 hover:bg-red-500"
                disabled={busy || locked}
                onClick={() => void execute()}
              >
                {busy ? <Loader2 size={14} className="mr-1.5 animate-spin" aria-hidden /> : <Gavel size={14} className="mr-1.5" aria-hidden />}
                Execute takedown
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
              Ban a hash directly
            </h3>
            <p className="mt-1 text-xs text-zinc-500">
              Blocks the bytes anywhere, with no report. A future upload with the same SHA-256 (or perceptual twin) is rejected.
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <label className="sm:col-span-2">
                <span className="mb-1 block text-[11px] uppercase tracking-wide text-zinc-500">SHA-256 (64 hex)</span>
                <input
                  value={hashSha}
                  onChange={(e) => setHashSha(e.target.value)}
                  placeholder="64 hexadecimal characters"
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2 font-mono text-xs text-white outline-none transition-colors placeholder:text-zinc-600 focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30"
                />
              </label>
              <label>
                <span className="mb-1 block text-[11px] uppercase tracking-wide text-zinc-500">Perceptual hash (optional)</span>
                <input
                  value={hashPhash}
                  onChange={(e) => setHashPhash(e.target.value)}
                  placeholder="16 hex"
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2 font-mono text-xs text-white outline-none transition-colors placeholder:text-zinc-600 focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30"
                />
              </label>
              <label>
                <span className="mb-1 block text-[11px] uppercase tracking-wide text-zinc-500">Note (optional)</span>
                <input
                  value={hashNote}
                  onChange={(e) => setHashNote(e.target.value)}
                  maxLength={1000}
                  placeholder="Why is this being banned?"
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-xs text-white outline-none transition-colors placeholder:text-zinc-600 focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30"
                />
              </label>
            </div>
            <Button size="sm" className="mt-3" disabled={hashBusy || locked} onClick={() => void banHashAction()}>
              {hashBusy ? <Loader2 size={14} className="mr-1.5 animate-spin" aria-hidden /> : <Ban size={14} className="mr-1.5" aria-hidden />}
              Ban hash
            </Button>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-5">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
              <Gavel size={15} className="text-zinc-400" aria-hidden />
              Take down a whole profile
            </h3>
            <p className="mt-1 text-xs text-zinc-500">
              Removes every media file owned by the profile's owner and bans their hashes. Enter a profile slug or id.
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <label>
                <span className="mb-1 block text-[11px] uppercase tracking-wide text-zinc-500">Profile slug or id</span>
                <input
                  value={profileRef}
                  onChange={(e) => setProfileRef(e.target.value)}
                  placeholder="e.g. alice or a uuid"
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-xs text-white outline-none transition-colors placeholder:text-zinc-600 focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30"
                />
              </label>
              <label>
                <span className="mb-1 block text-[11px] uppercase tracking-wide text-zinc-500">Note (optional)</span>
                <input
                  value={profileNote}
                  onChange={(e) => setProfileNote(e.target.value)}
                  maxLength={1000}
                  placeholder="Optional note recorded with the bans."
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
              Also disable the owner's account
            </label>
            <Button
              size="sm"
              className="mt-3 bg-red-600 hover:bg-red-500"
              disabled={profileBusy || locked}
              onClick={() => void takeDownProfileForm()}
            >
              {profileBusy ? <Loader2 size={14} className="mr-1.5 animate-spin" aria-hidden /> : <Gavel size={14} className="mr-1.5" aria-hidden />}
              Take down profile
            </Button>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-5">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
              <UserX size={15} className="text-zinc-400" aria-hidden />
              Disable an account
            </h3>
            <p className="mt-1 text-xs text-zinc-500">
              Locks the account out (sign-in blocked) with a recorded reason. The user can appeal; it never deletes data.
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <label>
                <span className="mb-1 block text-[11px] uppercase tracking-wide text-zinc-500">Username or user id</span>
                <input
                  value={accountRef}
                  onChange={(e) => setAccountRef(e.target.value)}
                  placeholder="@alice or a uuid"
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-xs text-white outline-none transition-colors placeholder:text-zinc-600 focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30"
                />
              </label>
              <label>
                <span className="mb-1 block text-[11px] uppercase tracking-wide text-zinc-500">Reason</span>
                <input
                  value={accountReason}
                  onChange={(e) => setAccountReason(e.target.value)}
                  maxLength={1000}
                  placeholder="Shown in the disabled queue."
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-xs text-white outline-none transition-colors placeholder:text-zinc-600 focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30"
                />
              </label>
            </div>
            <Button size="sm" className="mt-3 bg-red-600 hover:bg-red-500" disabled={accountBusy || locked} onClick={() => void disableAccountForm()}>
              {accountBusy ? <Loader2 size={14} className="mr-1.5 animate-spin" aria-hidden /> : <UserX size={14} className="mr-1.5" aria-hidden />}
              Disable account
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
        setError(res.error ?? "Could not load hash bans");
        return;
      }
      setHashes(res.data);
      setTotal(res.pagination?.total ?? 0);
    } catch {
      setError("Could not load hash bans");
    } finally {
      setLoading(false);
    }
  }, [showActive]);

  useEffect(() => {
    void load();
  }, [load]);

  const lift = async (id: string) => {
    if (
      !window.confirm(
        "Lift this hash ban? Un-banning means the same bytes can be uploaded again by any account."
      )
    ) {
      return;
    }
    setBusyId(id);
    setNotice(null);
    const res = await api.liftAdminDmcaHashBan(id);
    setBusyId(null);
    if (!res.success) {
      setNotice({ tone: "err", text: res.error ?? "Could not lift the ban" });
      return;
    }
    setNotice({ tone: "ok", text: "Hash ban lifted." });
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
          Active · {total}
        </button>
        <button
          type="button"
          onClick={() => setShowActive(false)}
          className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
            !showActive ? "bg-zinc-700/60 text-zinc-200" : "bg-zinc-800/70 text-zinc-400 hover:text-zinc-200"
          }`}
        >
          History
        </button>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-zinc-400 transition-colors hover:bg-white/5 hover:text-white disabled:opacity-60"
        >
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} aria-hidden />
          Refresh
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
        <p className="text-sm text-zinc-500">Loading hash bans…</p>
      ) : hashes.length === 0 ? (
        <p className="text-sm text-zinc-500">
          {showActive ? "No active hash bans." : "No previously un-banned hashes."}
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
                {h.active ? "active" : "lifted"}
              </span>
              <span className="text-zinc-500">
                since {new Date(h.bannedAt).toLocaleString()}
                {h.bannedBy ? ` by @${h.bannedBy.username}` : ""}
                {h.unbannedAt ? ` · lifted ${new Date(h.unbannedAt).toLocaleString()}` : ""}
                {h.unbannedBy ? ` by @${h.unbannedBy.username}` : ""}
              </span>
              {h.reason && <span className="max-w-[280px] truncate text-zinc-600">· {h.reason}</span>}
              {h.active && (
                <span className="ml-auto">
                  <Button size="sm" variant="outline" disabled={busyId === h.id || locked} onClick={() => void lift(h.id)}>
                    {busyId === h.id ? <Loader2 size={13} className="mr-1 animate-spin" aria-hidden /> : <Ban size={13} className="mr-1" aria-hidden />}
                    Un-ban
                  </Button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      <p className="flex items-start gap-2 text-xs text-zinc-500">
        <ShieldCheck size={13} className="mt-0.5 shrink-0" aria-hidden />
        Un-banning restores the original files by bytes, not as stored copies. Use it for false
        positives — lifting does not touch any account state.
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
        setError(res.error ?? "Could not load disabled accounts");
        return;
      }
      setUsers(res.data);
      setTotal(res.pagination?.total ?? 0);
    } catch {
      setError("Could not load disabled accounts");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const reactivate = async (user: DisabledRow) => {
    const decision = window.prompt(
      `Decision note for re-activating @${user.username}. This is recorded on the account and is never shown to the user.`
    );
    if (decision === null) return;
    if (!decision.trim()) {
      setNotice({ tone: "err", text: "A decision note is required." });
      return;
    }
    setBusyId(user.id);
    setNotice(null);
    const res = await api.reactivateAdminDmcaUser(user.id, decision.trim());
    setBusyId(null);
    if (!res.success) {
      setNotice({ tone: "err", text: res.error ?? "Could not re-activate the account" });
      return;
    }
    setNotice({ tone: "ok", text: `@${user.username} re-activated.` });
    await load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-zinc-500">
          {total} disabled account{total === 1 ? "" : "s"}
        </span>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-zinc-400 transition-colors hover:bg-white/5 hover:text-white disabled:opacity-60"
        >
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} aria-hidden />
          Refresh
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
        <p className="text-sm text-zinc-500">Loading disabled accounts…</p>
      ) : users.length === 0 ? (
        <p className="text-sm text-zinc-500">No accounts are currently disabled.</p>
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
                    {u.disabledReason ?? "unspecified"}
                  </span>
                  {u.appealSubmittedAt ? (
                    <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-xs font-medium text-sky-400">
                      has an appeal
                    </span>
                  ) : null}
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  {u.email} · disabled {new Date(u.disabledAt).toLocaleString()} ·{" "}
                  {u.reportsFiled} report{u.reportsFiled === 1 ? "" : "s"} filed against them
                </p>
                {u.appealSubmittedAt ? (
                  <p className="mt-0.5 text-[11px] text-zinc-600">
                    Appeal {new Date(u.appealSubmittedAt).toLocaleString()}
                    {u.appealReviewedAt ? ` · reviewed ${new Date(u.appealReviewedAt).toLocaleString()}` : " · not yet reviewed"}
                    {u.appealDecision ? ` · decision: ${u.appealDecision}` : ""}
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
                Re-activate
              </Button>
            </li>
          ))}
        </ul>
      )}

      <p className="flex items-start gap-2 text-xs text-zinc-500">
        <CheckCircle2 size={13} className="mt-0.5 shrink-0" aria-hidden />
        Re-activation is always a manual operator decision. A counter-notice lifts the hash bans but
        never turns an account back on by itself.
      </p>
    </div>
  );
}