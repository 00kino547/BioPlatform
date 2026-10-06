// Instance-owner tooling for the Terms of Service / Privacy Policy change
// notice.
//
// When POLICY_VERSIONS (lib/newsletter.ts) is bumped, two things happen:
//
//   1. the deemed-acceptance gate (middleware/consent.ts) stops every account
//      that has not accepted the new versions, forcing them to read and accept;
//   2. this module lets the instance owner SEE that and TELL people about it,
//      either from the admin panel button or automatically from the env toggle.
//
// "Automatically" is intentionally deduplicated: the version pair that was last
// notified is stored in SystemSetting, so a restart loop cannot spam every
// account. Sending is sequential and rate-limited by the caller.

import { getEnv } from "../config/env.js";
import { prisma } from "./prisma.js";
import { POLICY_VERSIONS, consentCurrent, deemedAcceptanceCutoff, policyEffectiveDate } from "./newsletter.js";
import { getCacheDriver } from "./cache.js";
import { sendEmail, isEmailEnabled } from "./email.js";

/** SystemSetting key holding the version pair we last emailed about. */
const LAST_NOTIFIED_KEY = "policy_notice_last_notified";
/** SystemSetting key holding the operator's own note shown in the panel. */
const NOTICE_NOTE_KEY = "policy_notice_note";

/** Users emailed per run. Keeps one click from queueing thousands of sends. */
const SEND_BATCH_LIMIT = 500;

export interface PolicyStatus {
  versions: typeof POLICY_VERSIONS;
  /**
   * The operator auto-accept rule as configured on this instance, so the panel can
   * show which accounts it applies to instead of leaving staff to guess.
   */
  operatorAutoAccept: {
    /** POLICY_ADMIN_AUTO_ACCEPT */
    enabled: boolean;
    /** Role slugs covered by POLICY_ADMIN_AUTO_ACCEPT_ROLES. */
    roles: string[];
    /** False while the 30-day review window is still open. */
    windowOpen: boolean;
    /** When the window opens / auto-acceptance becomes possible. */
    cutoff: string;
  };
  effectiveDate: string;
  deemedAcceptanceCutoff: string;
  /** Accounts that have not accepted and are not yet deemed. */
  pendingCount: number;
  /** How many of those have a verified mailbox, i.e. can actually be emailed. */
  emailableCount: number;
  /** Total accounts, for the "x of y" readout. */
  totalCount: number;
  /** True when a new version has shipped that nobody has been notified about. */
  noticePending: boolean;
  lastNotified: string | null;
  /** Operator's free-text note included in the notice email. */
  note: string | null;
  /** Whether an automatic notice is armed (env toggle). */
  autoNotifyEnabled: boolean;
  emailConfigured: boolean;
}

/** Serialises the version pair so it can be compared as one value. */
function versionKey(versions: { tos: string; privacy: string }): string {
  return `${versions.tos}|${versions.privacy}`;
}

async function readSetting(key: string): Promise<string | null> {
  const row = await prisma.systemSetting.findUnique({ where: { key } });
  return row?.value?.trim() || null;
}

async function writeSetting(key: string, value: string): Promise<void> {
  await prisma.systemSetting.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
}

/**
 * Prisma filter for "this account has not pinned the current policy versions".
 *
 * Written as an explicit OR rather than `NOT: { AND: [...] }` because the
 * latter is silently broken by SQL three-valued logic: for an account where both
 * columns are NULL, Prisma emits `NOT (accepted_tos_version = '…' AND
 * accepted_privacy_version = '…')`, and `NOT (NULL AND NULL)` is **NULL**, not
 * TRUE, so the row is dropped. Every account created before consent was
 * recorded has both columns NULL — i.e. exactly the accounts that most need to
 * be told. That is why the status panel reported 5 awaiting acceptance while the
 * send resolved 0 recipients and silently did nothing.
 *
 * Each clause is spelled out so NULL is handled as NULL: a value that differs
 * from the current version matches `not`, a value that was never recorded
 * matches `null`, and an account pinned to both current versions matches none of
 * the four (so it is correctly excluded).
 */
export function notCurrentOnConsent() {
  return {
    OR: [
      { acceptedTosVersion: null },
      { acceptedPrivacyVersion: null },
      { acceptedTosVersion: { not: POLICY_VERSIONS.tos } },
      { acceptedPrivacyVersion: { not: POLICY_VERSIONS.privacy } },
    ],
  };
}

/**
 * Counts accounts that are not current on consent.
 *
 * An account is current if it pinned the current versions, or if it logged in
 * at/after the deemed-acceptance cutoff (30 days after the effective date).
 *
 * `outstanding` below is the single definition of "still has to accept": not
 * pinned to the current versions AND not yet deemed by continued use (never
 * signed in, or last login before the cutoff). The recipient list reuses it and
 * only adds `emailVerified`, because an unverified mailbox cannot receive mail —
 * so the panel can never promise a send it cannot perform.
 */
export async function pendingConsentCount(): Promise<{ pending: number; total: number; emailable: number }> {
  const cutoff = deemedAcceptanceCutoff(policyEffectiveDate());
  // OR is a single top-level key, so the not-current and not-deemed conditions
  // have to be nested inside AND rather than spread side by side.
  const outstanding = {
    AND: [
      notCurrentOnConsent(),
      { OR: [{ lastLoginAt: null }, { lastLoginAt: { lt: cutoff } }] },
    ],
  };

  const [total, pending, emailable] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: outstanding }),
    prisma.user.count({ where: { ...outstanding, emailVerified: true } }),
  ]);

  return { pending, total, emailable };
}

export async function getPolicyStatus(): Promise<PolicyStatus> {
  const { pending, total, emailable } = await pendingConsentCount();
  const lastNotified = await readSetting(LAST_NOTIFIED_KEY);
  const note = await readSetting(NOTICE_NOTE_KEY);

  return {
    versions: POLICY_VERSIONS,
    effectiveDate: policyEffectiveDate().toISOString(),
    deemedAcceptanceCutoff: deemedAcceptanceCutoff(policyEffectiveDate()).toISOString(),
    pendingCount: pending,
    emailableCount: emailable,
    totalCount: total,
    noticePending: lastNotified !== versionKey(POLICY_VERSIONS),
    lastNotified,
    note,
    autoNotifyEnabled: getEnv().POLICY_NOTICE_AUTO_EMAIL,
    emailConfigured: isEmailEnabled(),
    // Surfaced so the panel can state the rule in force instead of leaving an
    // operator to guess whether staff accounts are being auto-accepted.
    operatorAutoAccept: {
      enabled: getEnv().POLICY_ADMIN_AUTO_ACCEPT,
      roles: getEnv()
        .POLICY_ADMIN_AUTO_ACCEPT_ROLES.split(",")
        .map((slug) => slug.trim())
        .filter(Boolean),
      // False while the review window is still open, i.e. while staff accounts
      // are genuinely blocked and must click through.
      windowOpen: new Date() >= deemedAcceptanceCutoff(policyEffectiveDate()),
      cutoff: deemedAcceptanceCutoff(policyEffectiveDate()).toISOString(),
    },
  };
}

export async function setPolicyNoticeNote(note: string | null): Promise<void> {
  const clean = note?.trim();
  if (!clean) {
    await prisma.systemSetting.deleteMany({ where: { key: NOTICE_NOTE_KEY } });
    return;
  }
  if (clean.length > 500) throw new Error("Note must be 500 characters or fewer");
  await writeSetting(NOTICE_NOTE_KEY, clean);
}

/** The accounts a notice run should email: pending, verified email, not banned. */
async function pendingRecipients(limit: number) {
  const cutoff = deemedAcceptanceCutoff(policyEffectiveDate());
  return prisma.user.findMany({
    // Deliberately the SAME filter `pendingConsentCount` uses (differing only by
    // `emailVerified`). The two used to disagree: the count excluded nobody via
    // subtraction while this query dropped every NULL-consent row, so the panel
    // said "5 awaiting" and the button reported "0 sent" and moved on.
    where: {
      AND: [
        notCurrentOnConsent(),
        { OR: [{ lastLoginAt: null }, { lastLoginAt: { lt: cutoff } }] },
      ],
      emailVerified: true,
    },
    select: { id: true, email: true, username: true },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
}

function noticeHtml(username: string, note: string | null): string {
  const base = getEnv().APP_URL.replace(/\/$/, "");
  const noteBlock = note
    ? `<p style="margin:0 0 16px">${note.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c] as string)}</p>`
    : "";
  return `<!doctype html><html><body style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;background:#0b0b0f;color:#e4e4e7;line-height:1.6">
<div style="max-width:560px;margin:0 auto;padding:32px 24px">
<h1 style="font-size:20px;margin:0 0 16px">Our Terms of Service and Privacy Policy have changed</h1>
<p style="margin:0 0 16px">Hi ${username},</p>
<p style="margin:0 0 16px">We updated our legal documents. The new versions take effect on ${POLICY_VERSIONS.tos} and we need your acceptance before you can continue using the service.</p>
${noteBlock}
<p style="margin:0 0 16px"><a href="${base}/terms" style="color:#a78bfa">Read the Terms of Service</a> &middot; <a href="${base}/privacy" style="color:#a78bfa">Read the Privacy Policy</a></p>
<p style="margin:0;color:#a1a1aa;font-size:13px">You will be asked to accept the new versions the next time you sign in. Nothing about your account or content changes.</p>
<p style="margin:16px 0 0;color:#a1a1aa;font-size:13px">&mdash; BioPlatform</p>
</div></body></html>`;
}

export interface NoticeSendResult {
  /** Accounts the notice went to. */
  sent: number;
  /** Sends that failed, with the reason. */
  failed: number;
  /** False when mail is not configured, so the panel can say why. */
  attempted: boolean;
  error?: string;
  /** True when the version pair was already recorded as notified. */
  skippedAlreadyNotified: boolean;
}

/**
 * Emails every account that still has to accept, then records the version pair
 * as notified so the automatic path cannot send it twice.
 */
export async function sendPolicyNotice(): Promise<NoticeSendResult> {
  const lastNotified = await readSetting(LAST_NOTIFIED_KEY);

  if (!isEmailEnabled()) {
    return { sent: 0, failed: 0, attempted: false, error: "Email is not configured on this instance", skippedAlreadyNotified: false };
  }

  const recipients = await pendingRecipients(SEND_BATCH_LIMIT);
  if (recipients.length === 0) {
    // Everyone is current. Still record it, so the panel stops nagging.
    await writeSetting(LAST_NOTIFIED_KEY, versionKey(POLICY_VERSIONS));
    return { sent: 0, failed: 0, attempted: true, skippedAlreadyNotified: false };
  }

  const note = await readSetting(NOTICE_NOTE_KEY);
  let sent = 0;
  let failed = 0;

  for (const user of recipients) {
    const result = await sendEmail({
      to: user.email,
      subject: "Our Terms of Service and Privacy Policy have changed",
      html: noticeHtml(user.username, note),
    });
    if (result.success) sent += 1;
    else failed += 1;
  }

  // Only mark as notified once we have actually reached the whole pending set,
  // so a partial run is retried rather than silently abandoned.
  if (recipients.length < SEND_BATCH_LIMIT) {
    await writeSetting(LAST_NOTIFIED_KEY, versionKey(POLICY_VERSIONS));
  }
  await getCacheDriver().del(POLICY_STATUS_CACHE_KEY);

  return { sent, failed, attempted: true, skippedAlreadyNotified: lastNotified === versionKey(POLICY_VERSIONS) };
}

const POLICY_STATUS_CACHE_KEY = "admin:policy-status";

/**
 * Runs the automatic notice when the env toggle is on and the current version
 * pair has not been announced yet. Called once at boot.
 *
 * Safe to call repeatedly: it is a no-op unless the toggle is on AND the
 * version pair differs from the last notified one.
 */
export async function maybeAutoNotifyPolicyChange(): Promise<void> {
  if (!getEnv().POLICY_NOTICE_AUTO_EMAIL) return;
  if (!isEmailEnabled()) return;

  const lastNotified = await readSetting(LAST_NOTIFIED_KEY);

  // FIRST RUN SEEDS A BASELINE INSTEAD OF SENDING.
  //
  // The absence of the key cannot distinguish "fresh install" from "an existing
  // deployment upgrading to code that has this feature". Sending on the first
  // run would therefore email every account a "our legal documents have
  // changed" notice the moment this ships — even though `POLICY_VERSIONS` has
  // not changed and nothing was announced. Recording the current pair as the
  // baseline makes the feature fire only on a genuine *subsequent* change.
  //
  // Trade-off: an operator who introduces this code AND bumps the policy
  // versions in the same release gets no automatic email, because the baseline
  // is seeded at the new version. They send from Admin → Legal instead. Mailing
  // every user on upgrade is far worse than asking for one button click.
  if (lastNotified === null) {
    await writeSetting(LAST_NOTIFIED_KEY, versionKey(POLICY_VERSIONS));
    console.log(
      `[policy] notice baseline seeded at version ${versionKey(POLICY_VERSIONS)}; no email sent on first run. ` +
        `Bump POLICY_VERSIONS (or use Admin -> Legal) to announce a change.`
    );
    return;
  }

  if (lastNotified === versionKey(POLICY_VERSIONS)) return;

  // An instance with no accounts has nobody to tell.
  const { total } = await pendingConsentCount();
  if (total === 0) {
    await writeSetting(LAST_NOTIFIED_KEY, versionKey(POLICY_VERSIONS));
    return;
  }

  const result = await sendPolicyNotice();
  if (result.sent > 0) {
    console.log(`[policy] automatic change notice sent to ${result.sent} account(s) for version ${versionKey(POLICY_VERSIONS)}`);
  }
}

export { consentCurrent };
