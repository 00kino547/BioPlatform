import { useCallback, useEffect, useState } from "react";
import { api, type PolicyStatus, type PolicyNoticeSendResult } from "@/lib/api";
import { Scale, Mail, RefreshCw, Save, ShieldCheck, AlertTriangle } from "lucide-react";

/**
 * Owner view of the Terms of Service / Privacy Policy change state.
 *
 * Bumping POLICY_VERSIONS in the backend makes the consent gate stop every
 * out-of-date account. This tab answers the two follow-up questions: how many
 * people still have to accept, and has anyone actually been told.
 *
 * The "Email everyone" button works regardless of POLICY_NOTICE_AUTO_EMAIL —
 * that env toggle only controls the automatic run at boot.
 */
export function AdminPolicyTab() {
  const [status, setStatus] = useState<PolicyStatus | null>(null);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingNote, setSavingNote] = useState(false);
  const [notifying, setNotifying] = useState(false);
  const [result, setResult] = useState<PolicyNoticeSendResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getPolicyStatus();
      if (res.success && res.data) {
        setStatus(res.data);
        setNote(res.data.note ?? "");
        setError(null);
      } else {
        setError(res.error ?? "Could not load policy status");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const saveNote = async () => {
    setSavingNote(true);
    try {
      const res = await api.setPolicyNoticeNote(note);
      if (res.success) {
        setError(null);
        await load();
      } else {
        setError(res.error ?? "Could not save the note");
      }
    } finally {
      setSavingNote(false);
    }
  };

  const sendNotice = async () => {
    setNotifying(true);
    try {
      const res = await api.sendPolicyNotice();
      if (res.success && res.data) {
        setResult(res.data);
        setError(res.data.error ?? null);
        await load();
      } else {
        setError(res.error ?? "Could not send the notice");
      }
    } finally {
      setNotifying(false);
    }
  };

  return (
    <section className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Scale size={18} className="text-violet-400" />
          <h2 className="text-lg font-semibold text-white">Legal policies</h2>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-zinc-400 transition-colors hover:bg-white/5 hover:text-white disabled:opacity-60"
        >
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </header>

      {error ? (
        <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </p>
      ) : null}

      {status && status.noticePending ? (
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-400" />
          <p className="text-sm text-amber-200">
            Version {status.versions.tos} is live and has not been announced yet. Accounts that have
            not accepted are blocked from signing in until they do.
          </p>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card label="Terms version" value={status?.versions.tos ?? "—"} />
        <Card label="Privacy version" value={status?.versions.privacy ?? "—"} />
        <Card
          label="Awaiting acceptance"
          value={status ? `${status.pendingCount} / ${status.totalCount}` : "—"}
          hint={status ? acceptanceHint(status) : undefined}
        />
        <Card
          label="Auto-notice"
          value={status ? (status.autoNotifyEnabled ? "Armed" : "Off") : "—"}
          hint={status ? (status.autoNotifyEnabled ? "Runs at boot" : "Button only") : undefined}
        />
      </div>

      {status ? (
        <dl className="grid gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-4 text-sm sm:grid-cols-3">
          <Row label="Effective" value={formatDate(status.effectiveDate)} />
          <Row label="Deemed after" value={formatDate(status.deemedAcceptanceCutoff)} hint="30 days of use" />
          <Row
            label="Last notified"
            value={status.lastNotified ? status.lastNotified.replace("|", " / ") : "Never"}
          />
        </dl>
      ) : null}

      {/* The auto-accept rule is a published legal position (Terms §14), so the
          operator needs to be able to see which accounts it covers right now —
          otherwise nobody can tell whether a staff account was accepted by a person
          or by the platform. */}
      {status?.operatorAutoAccept ? (
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <h3 className="mb-1 text-sm font-medium text-zinc-200">Operator auto-accept</h3>
          <p className="text-sm text-zinc-400">
            {status.operatorAutoAccept.enabled ? (
              <>
                Accounts holding{" "}
                <span className="font-mono text-zinc-300">
                  {status.operatorAutoAccept.roles.join(", ") || "no role"}
                </span>{" "}
                are recorded as accepting each new policy version automatically — but only once the
                30-day review window has passed
                {status.operatorAutoAccept.windowOpen
                  ? ", which it has for this version."
                  : `, on ${formatDate(status.operatorAutoAccept.cutoff)}.`}{" "}
                Until then those accounts must click through like anyone else, or they stay blocked
                out of this panel.
              </>
            ) : (
              <>
                Disabled on this instance. Staff accounts click through the acceptance screen like
                any other account and can be locked out until they do.
              </>
            )}
          </p>
          <p className="mt-2 text-xs text-zinc-500">
            Change it with{" "}
            <span className="font-mono">POLICY_ADMIN_AUTO_ACCEPT</span> and{" "}
            <span className="font-mono">POLICY_ADMIN_AUTO_ACCEPT_ROLES</span>, then recreate the
            backend. Automatic acceptances are recorded with a marker, so the audit trail never
            claims a person consented when the platform recorded it.
          </p>
        </div>
      ) : null}

      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
        <label htmlFor="policy-note" className="flex items-center gap-2 text-sm font-medium text-white">
          <Mail size={15} className="text-zinc-400" />
          Note included in the notice email
        </label>
        <p className="mt-1 text-xs text-zinc-500">
          Optional. Shown above the document links so users know why they are being asked again.
        </p>
        <textarea
          id="policy-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={500}
          rows={3}
          placeholder="e.g. We clarified how long we keep analytics data."
          className="mt-3 w-full resize-y rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none transition-colors placeholder:text-zinc-600 focus:border-violet-500/60"
        />
        <button
          type="button"
          onClick={saveNote}
          disabled={savingNote || note === (status?.note ?? "")}
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3.5 py-2 text-xs font-medium text-white transition-colors hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Save size={13} />
          {savingNote ? "Saving…" : "Save note"}
        </button>
      </div>

      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
        <p className="flex items-center gap-2 text-sm font-medium text-white">
          <ShieldCheck size={15} className="text-zinc-400" />
          Email the change notice
        </p>
        <p className="mt-1 text-xs text-zinc-500">
          Sends to accounts that have not accepted yet, 500 per run. Repeat runs pick up where the
          last one stopped.
        </p>

        {!status?.emailConfigured ? (
          <p className="mt-3 text-xs text-amber-300">
            Mail is not configured on this instance, so no email can be sent. The consent gate still
            applies — users are asked to accept when they sign in.
          </p>
        ) : null}

        <button
          type="button"
          onClick={sendNotice}
          disabled={notifying || !status?.emailConfigured}
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3.5 py-2 text-xs font-medium text-white transition-colors hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Mail size={13} />
          {notifying ? "Sending…" : "Email everyone"}
        </button>

        {result ? (
          <p className="mt-3 text-xs text-zinc-400">
            {result.error
              ? result.error
              : `Sent to ${result.sent} account${result.sent === 1 ? "" : "s"}${
                  result.failed ? `, ${result.failed} failed` : ""
                }.${unreachableHint(result)}`}
          </p>
        ) : null}
      </div>
    </section>
  );
}

/**
 * The button can only reach accounts with a verified mailbox, so say so rather
 * than letting the click report a surprise shortfall.
 */
function acceptanceHint(status: PolicyStatus): string | undefined {
  if (status.pendingCount === 0) return "Everyone is current";
  if (status.emailableCount === status.pendingCount) return undefined;
  return `${status.emailableCount} can be emailed · ${status.pendingCount - status.emailableCount} unverified`;
}

function Card({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3">
      <p className="text-[11px] uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-1 text-base font-medium text-white">{value}</p>
      {hint ? <p className="mt-0.5 text-[11px] text-zinc-600">{hint}</p> : null}
    </div>
  );
}

function Row({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-zinc-500">{label}</dt>
      <dd className="mt-0.5 text-zinc-200">
        {value}
        {hint ? <span className="ml-1.5 text-[11px] text-zinc-600">{hint}</span> : null}
      </dd>
    </div>
  );
}

/** Accounts that were counted but could not be emailed (unverified mailbox). */
function unreachableHint(result: PolicyNoticeSendResult): string {
  return result.sent === 0 ? " No account had a verified mailbox to send to." : "";
}

function formatDate(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
