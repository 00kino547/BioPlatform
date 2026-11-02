import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { api, type PolicyStatus, type PolicyNoticeSendResult } from "@/lib/api";
import { formatDate as formatLocaleDate } from "@/lib/intl";
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
  // Owner view of the Terms of Service / Privacy Policy change state.
  const { t } = useTranslation("admin");
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
        setError(res.error ?? t("admin.policy.loadStatusFailed"));
      }
    } finally {
      setLoading(false);
    }
  }, [t]);

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
        setError(res.error ?? t("admin.policy.saveNoteFailed"));
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
        setError(res.error ?? t("admin.policy.sendNoticeFailed"));
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
          <h2 className="text-lg font-semibold text-white">{t("admin.policy.title")}</h2>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-zinc-400 transition-colors hover:bg-white/5 hover:text-white disabled:opacity-60"
        >
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          {t("admin.policy.refresh")}
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
            {t("admin.policy.noticePending", { version: status.versions.tos })}
          </p>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card label={t("admin.policy.cardTermsVersion")} value={status?.versions.tos ?? "—"} />
        <Card label={t("admin.policy.cardPrivacyVersion")} value={status?.versions.privacy ?? "—"} />
        <Card
          label={t("admin.policy.cardAwaiting")}
          value={status ? `${status.pendingCount} / ${status.totalCount}` : "—"}
          hint={status ? acceptanceHint(status, t) : undefined}
        />
        <Card
          label={t("admin.policy.cardAutoNotice")}
          value={status ? (status.autoNotifyEnabled ? t("admin.policy.armed") : t("admin.policy.off")) : "—"}
          hint={status ? (status.autoNotifyEnabled ? t("admin.policy.runsAtBoot") : t("admin.policy.buttonOnly")) : undefined}
        />
      </div>

      {status ? (
        <dl className="grid gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-4 text-sm sm:grid-cols-3">
          <Row label={t("admin.policy.rowEffective")} value={formatDate(status.effectiveDate)} />
          <Row label={t("admin.policy.rowDeemedAfter")} value={formatDate(status.deemedAcceptanceCutoff)} hint={t("admin.policy.deemedHint")} />
          <Row
            label={t("admin.policy.rowLastNotified")}
            value={status.lastNotified ? status.lastNotified.replace("|", " / ") : t("admin.policy.never")}
          />
        </dl>
      ) : null}

      {/* The auto-accept rule is a published legal position (Terms §14), so the
          operator needs to be able to see which accounts it covers right now —
          otherwise nobody can tell whether a staff account was accepted by a person
          or by the platform. */}
      {status?.operatorAutoAccept ? (
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <h3 className="mb-1 text-sm font-medium text-zinc-200">{t("admin.policy.operatorAutoAccept")}</h3>
          <p className="text-sm text-zinc-400">
            {status.operatorAutoAccept.enabled ? (
              <>
                {t("admin.policy.autoAcceptEnabled", {
                  roles: status.operatorAutoAccept.roles.join(", ") || t("admin.policy.noRole"),
                  window: status.operatorAutoAccept.windowOpen
                    ? t("admin.policy.autoAcceptWindowOpen")
                    : t("admin.policy.autoAcceptWindowClosed", { date: formatDate(status.operatorAutoAccept.cutoff) }),
                })}
                {t("admin.policy.autoAcceptEnabledSuffix")}
              </>
            ) : (
              <>
                {t("admin.policy.autoAcceptDisabled")}
              </>
            )}
          </p>
          <p className="mt-2 text-xs text-zinc-500">
            {t("admin.policy.autoAcceptConfigHint")}
          </p>
        </div>
      ) : null}

      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
        <label htmlFor="policy-note" className="flex items-center gap-2 text-sm font-medium text-white">
          <Mail size={15} className="text-zinc-400" />
          {t("admin.policy.noteLabel")}
        </label>
        <p className="mt-1 text-xs text-zinc-500">
          {t("admin.policy.noteHint")}
        </p>
        <textarea
          id="policy-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={500}
          rows={3}
          placeholder={t("admin.policy.notePlaceholder")}
          className="mt-3 w-full resize-y rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none transition-colors placeholder:text-zinc-600 focus:border-violet-500/60"
        />
        <button
          type="button"
          onClick={saveNote}
          disabled={savingNote || note === (status?.note ?? "")}
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3.5 py-2 text-xs font-medium text-white transition-colors hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Save size={13} />
          {savingNote ? t("admin.policy.saving") : t("admin.policy.saveNote")}
        </button>
      </div>

      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
        <p className="flex items-center gap-2 text-sm font-medium text-white">
          <ShieldCheck size={15} className="text-zinc-400" />
          {t("admin.policy.emailChangeNotice")}
        </p>
        <p className="mt-1 text-xs text-zinc-500">
          {t("admin.policy.emailChangeNoticeHint")}
        </p>

        {!status?.emailConfigured ? (
          <p className="mt-3 text-xs text-amber-300">
            {t("admin.policy.mailNotConfigured")}
          </p>
        ) : null}

        <button
          type="button"
          onClick={sendNotice}
          disabled={notifying || !status?.emailConfigured}
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3.5 py-2 text-xs font-medium text-white transition-colors hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Mail size={13} />
          {notifying ? t("admin.policy.sending") : t("admin.policy.emailEveryone")}
        </button>

        {result ? (
          <p className="mt-3 text-xs text-zinc-400">
            {result.error
              ? result.error
              : `${t("admin.policy.sentResult", {
                  count: result.sent,
                  s: result.sent === 1 ? "" : "s",
                  failedSuffix: result.failed ? t("admin.policy.sentFailedSuffix", { count: result.failed }) : "",
                })}${unreachableHint(result, t)}`}
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
function acceptanceHint(status: PolicyStatus, t: TFunction): string | undefined {
  if (status.pendingCount === 0) return t("admin.policy.everyoneCurrent");
  if (status.emailableCount === status.pendingCount) return undefined;
  return t("admin.policy.acceptanceHint", {
    emailable: status.emailableCount,
    unverified: status.pendingCount - status.emailableCount,
  });
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
function unreachableHint(result: PolicyNoticeSendResult, t: TFunction): string {
  return result.sent === 0 ? t("admin.policy.unreachableNone") : "";
}

function formatDate(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return formatLocaleDate(parsed, { day: "numeric", month: "short", year: "numeric" });
}
