// Core of the DMCA / takedown feature.
//
// Responsibilities (all shared between the public intake route, the admin
// takedown routes and the background purge job so they cannot drift):
//
//   1. Operator-facing toggle + grace window (config.yml public.policy.dmca).
//   2. Sanitization of free-text claimant input and URL allow-list validation.
//   3. In-memory rate limiter for the public intake endpoint.
//   4. E-mail alerts: to the operator when a report arrives, and to an account
//      holder when their account gets disabled.
//   5. The takedown itself: delete live files, clear the model references that
//      pointed at them, register permanent hash bans, disable the owning
//      accounts and adopt the report.
//   6. Appeal submission + account re-activation + the 30-day purge of accounts
//      that were never re-activated.

import path from "node:path";
import type { DmcaReport, MediaFile, MediaKind, Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";
import { getEnv } from "../config/env.js";
import { getInstanceConfig, getPublicInstanceConfig } from "./instanceConfig.js";
import { isEmailEnabled, sendEmail } from "./email.js";
import { deleteUpload } from "./mediaStore.js";
import { deleteProductUpload } from "./shop.js";
import { stripHtml } from "./validation.js";
import { deleteUserCompletely } from "./accountDeletion.js";
import { DMCA_REPORT_MAX, DMCA_APPEAL_MAX, DMCA_NOTE_MAX } from "./dmca.config.js";

/* ---------------------------------------------------------------------------
 * Configuration (config.yml -> public.policy.dmca)
 * ------------------------------------------------------------------------- */

/** True when the public intake form + endpoint accept new reports. */
export function dmcaIntakeEnabled(): boolean {
  return getPublicInstanceConfig().policy.dmca.intakeEnabled;
}

/** Days an account stays disabled before the purge deletes it completely. */
export function dmcaGraceDays(): number {
  return getPublicInstanceConfig().policy.dmca.disabledAccountGraceDays;
}

/**
 * The page a disabled account holder goes to in order to appeal.
 *
 * Single source of truth: the disabled-account notice e-mail, the 423 response
 * from `requireAuth`, the login rejection and the admin reactivation copy all
 * quote this URL, so they can never drift apart and point a user at a dead link.
 */
export function dmcaAppealUrl(): string {
  return `${getEnv().APP_URL.replace(/\/$/, "")}/account/disabled`;
}

/* ---------------------------------------------------------------------------
 * Input sanitization
 * ------------------------------------------------------------------------- */

/** Free text from a report/appeal/note. Sanitized (strip <>{}) and length-capped. */
export function sanitizeDmcaText(value: unknown, max = DMCA_REPORT_MAX): string {
  return stripHtml(String(value ?? "").trim()).slice(0, max);
}

/** http/https URL only — no protocol tricks (javascript:, file:, data:). */
export function isValidWebUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/** Single URL: trimmed, validated, or dropped. */
export function sanitizeDmcaUrl(value: unknown, max = 2048): string {
  const trimmed = String(value ?? "").trim();
  if (trimmed.length > max || !isValidWebUrl(trimmed)) return "";
  return trimmed;
}

/** Array of URLs, sanitized + deduped, capped for storage. */
export function sanitizeDmcaUrlList(value: unknown, maxItems = 20): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    if (out.length >= maxItems) break;
    const url = sanitizeDmcaUrl(item);
    if (url && !out.includes(url)) out.push(url);
  }
  return out;
}

/* ---------------------------------------------------------------------------
 * Rate limiting (public intake)
 * ------------------------------------------------------------------------- */

export const DMCA_INTAKE_LIMIT = 5;
export const DMCA_INTAKE_WINDOW_MS = 60 * 60 * 1000;

/** Appeals per disabled account per day — a disabled account is a single actor
 * with a captive audience, so the limit is keyed by user, not by IP. */
export const DMCA_APPEAL_LIMIT = 5;
export const DMCA_APPEAL_WINDOW_MS = 24 * 60 * 60 * 1000;

/** in-memory per-key sliding window of recent events (per-process only). */
const dmcaIntakeTimes = new Map<string, number[]>();
const dmcaAppealTimes = new Map<string, number[]>();

/**
 * Shared sliding-window check: returns whether one more event is allowed,
 * recording it when it is. Prunes stale entries so the maps cannot grow with
 * every distinct caller forever.
 */
function slidingWindowAllowed(
  ledger: Map<string, number[]>,
  key: string,
  limit: number,
  windowMs: number,
  now: number
): { allowed: boolean; retryAfterMs: number } {
  const times = (ledger.get(key) ?? []).filter((t) => now - t < windowMs);
  if (times.length >= limit) {
    const oldest = times[0];
    ledger.set(key, times);
    return { allowed: false, retryAfterMs: Math.max(0, windowMs - (now - oldest)) };
  }
  ledger.set(key, [...times, now]);
  return { allowed: true, retryAfterMs: 0 };
}

/** Record + evaluate a public submission for this IP. Limited to 5/hour/IP. */
export function dmcaIntakeRateAllowed(ip: string): { allowed: boolean; retryAfterMs: number } {
  const now = Date.now();
  for (const [key, times] of dmcaIntakeTimes) {
    const kept = times.filter((t) => now - t < DMCA_INTAKE_WINDOW_MS);
    if (kept.length) dmcaIntakeTimes.set(key, kept);
    else dmcaIntakeTimes.delete(key);
  }
  return slidingWindowAllowed(dmcaIntakeTimes, ip, DMCA_INTAKE_LIMIT, DMCA_INTAKE_WINDOW_MS, now);
}

/** Record + evaluate an appeal submission for this account. 5/day/user. */
export function dmcaAppealRateAllowed(userId: string): { allowed: boolean; retryAfterMs: number } {
  const now = Date.now();
  for (const [key, times] of dmcaAppealTimes) {
    const kept = times.filter((t) => now - t < DMCA_APPEAL_WINDOW_MS);
    if (kept.length) dmcaAppealTimes.set(key, kept);
    else dmcaAppealTimes.delete(key);
  }
  return slidingWindowAllowed(dmcaAppealTimes, userId, DMCA_APPEAL_LIMIT, DMCA_APPEAL_WINDOW_MS, now);
}

/* ---------------------------------------------------------------------------
 * Alerts
 * ------------------------------------------------------------------------- */

function legalMailbox(): string {
  // private.operatorContactEmail is never exposed on any public endpoint (see
  // instanceConfig.ts); it is the one place we are allowed to read it from.
  return getInstanceConfig().private.operatorContactEmail.trim();
}

/** Report cover text for the operator alert. Only used when SMTP is on. */
function reportSubject(reportId: string, workUrl: string): string {
  return `[DMCA] Takedown report ${reportId.slice(0, 8)} — ${workUrl}`;
}

/** E-mail the operator about a newly-filed report. Best-effort, never throws. */
export async function notifyOperatorOfDmca(report: Pick<DmcaReport, "id" | "claimantName" | "workUrl" | "description" | "infringingUrls" | "createdAt">): Promise<void> {
  if (!isEmailEnabled()) return;
  const to = legalMailbox();
  if (!to) return;

  // Escape each URL individually, then join with real <br/> separators. Escaping
  // the joined string previously turned those separators into visible "&lt;br/&gt;".
  const urls = infringingUrlsHtml(report.infringingUrls);
  await sendEmail({
    to,
    subject: reportSubject(report.id, report.workUrl),
    html: `
      <p>A new DMCA takedown report was filed on ${report.createdAt.toISOString()}.</p>
      <p><strong>Claimant:</strong> ${escapeHtml(report.claimantName)}<br/>
      <strong>Work claimed:</strong> ${escapeHtml(report.workUrl)}</p>
      <p><strong>Reported URLs:</strong><br/>${urls || "<em>none</em>"}</p>
      <p><strong>Details:</strong><br/>${escapeHtml(report.description)}</p>
      <p>Review it in the admin dashboard → DMCA &amp; takedowns.</p>
    `,
  }).catch((error) => {
    console.error("Failed to e-mail operator about DMCA report:", error);
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Render a report's infringing URLs for the operator e-mail. Each URL is escaped
 * individually and they are joined with real `<br/>` separators, so the HTML
 * renders as line breaks instead of a literal "&lt;br/&gt;" between entries.
 */
export function infringingUrlsHtml(urls: unknown): string {
  return (Array.isArray(urls) ? urls : [])
    .map((url) => escapeHtml(String(url)))
    .join("<br/>");
}

/** E-mail an account holder that their account was disabled + how to appeal. */
export async function sendDisabledNotice(userId: string, reason: string): Promise<void> {
  if (!isEmailEnabled()) return;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (!user?.email) return;

  const appealUrl = dmcaAppealUrl();
  await sendEmail({
    to: user.email,
    subject: "Your account was disabled (copyright takedown)",
    html: `
      <p>Your account was disabled on ${new Date().toISOString()} as part of a copyright
      takedown (reason: ${escapeHtml(reason)}).</p>
      <p>If this was a mistake, you can appeal it — sign in and go to
      <a href="${appealUrl}">${appealUrl}</a>, or reply using the platform's
      contact page. Accounts that are not re-activated within the review window
      are deleted completely.</p>
    `,
  }).catch((error) => {
    console.error("Failed to e-mail disabled-account notice:", error);
  });

  await prisma.user.update({
    where: { id: userId },
    data: { disabledNoticeSentAt: new Date() },
  });
}

/* ---------------------------------------------------------------------------
 * Disable / re-activate accounts
 * ------------------------------------------------------------------------- */

/** Lock an account: no authenticated access except the appeal endpoints. */
export async function disableAccount(userId: string, reason: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: {
      disabledAt: new Date(),
      disabledReason: reason,
      // Clear any appeal record left over from a PREVIOUS disable/re-activate
      // cycle. `purgeDisabledAccounts` treats a non-null `appealReviewedAt` as
      // "no open appeal", so a stale value here would let a freshly re-disabled
      // account with a new, unreviewed appeal be purged. Starting clean keeps
      // the purge invariant (reviewedAt set <=> an appeal has been answered).
      appealText: null,
      appealSubmittedAt: null,
      appealDecision: null,
      appealReviewedAt: null,
    },
  });
  // Best-effort notice; absence of SMTP must not fail the takedown.
  void sendDisabledNotice(userId, reason).catch(() => undefined);
}

/**
 * Re-activate a disabled account and clear its appeal record.
 *
 * The decision is recorded ON THE USER (`appealDecision` / `appealReviewedAt`),
 * which is the authoritative audit trail. Earlier this also wrote an
 * "Account re-activated" note onto every NEW DmcaReport with
 * `filedByUserId === userId` — but that relation points at the account that
 * FILED a report (the claimant), not the takedown that disabled this account.
 * The schema has no report→disabled-account link, so that write stamped
 * misleading notes onto the reactivated user's own unreviewed filings. It was
 * removed rather than guess a target (see docs/CHANGELOG).
 */
export async function reactivateAccount(userId: string, decision: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: {
      disabledAt: null,
      disabledReason: null,
      appealText: null,
      appealSubmittedAt: null,
      appealDecision: decision,
      appealReviewedAt: new Date(),
    },
  });
}

/* ---------------------------------------------------------------------------
 * Takedown
 * ------------------------------------------------------------------------- */

/** Thrown when the takedown input references nothing actionable. */
export class TakedownValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TakedownValidationError";
  }
}

/** Thrown when an operator action collides with existing state (e.g. a hash
 * that already carries a live ban). The route maps it to HTTP 409. */
export class TakedownConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TakedownConflictError";
  }
}

/** Drop a single uploaded file: delete the live copy and clear its references. */
export async function removeMediaFile(media: MediaFile): Promise<void> {
  const { id, kind, filePath, profileId } = media;

  switch (kind as MediaKind) {
    case "AVATAR":
      if (profileId) {
        await prisma.profile.updateMany({ where: { id: profileId, avatar: filePath }, data: { avatar: null } });
      }
      break;

    case "BANNER":
      if (profileId) {
        await prisma.profile.updateMany({ where: { id: profileId, banner: filePath }, data: { banner: null } });
      }
      break;

    case "BACKGROUND": {
      if (profileId) {
        // Background images live inside the profile theme JSON.
        const profile = await prisma.profile.findUnique({
          where: { id: profileId },
          select: { id: true, theme: true },
        });
        if (profile && typeof profile.theme === "object" && profile.theme !== null) {
          const theme = profile.theme as Record<string, unknown>;
          if (theme.backgroundImage === filePath) {
            const { backgroundImage: _drop, ...rest } = theme;
            await prisma.profile.update({
              where: { id: profileId },
              data: { theme: rest as Prisma.InputJsonValue },
            });
          }
        }
      }
      break;
    }

    case "LINK_ICON": {
      if (profileId) {
        // Icons are stored on the social link objects in the JSON column.
        const profile = await prisma.profile.findUnique({
          where: { id: profileId },
          select: { id: true, socialLinks: true },
        });
        if (profile && Array.isArray(profile.socialLinks)) {
          const links = profile.socialLinks as Array<Record<string, unknown>>;
          let changed = false;
          const next = links.map((link) => {
            if (link.image === filePath) {
              changed = true;
              const { image: _drop, ...rest } = link;
              return rest;
            }
            return link;
          });
          if (changed) {
            await prisma.profile.update({
              where: { id: profileId },
              data: { socialLinks: next as Prisma.InputJsonValue },
            });
          }
        }
      }
      break;
    }

    case "MUSIC":
      // The track exists to serve the file, so the whole row goes.
      await prisma.musicTrack.deleteMany({ where: { filePath } });
      break;

    case "SHOP_PREVIEW":
      // Just the preview artwork reference; the product itself stays.
      await prisma.product.updateMany({ where: { previewImage: filePath }, data: { previewImage: null } });
      break;

    case "SHOP_PRODUCT":
      // The product sells the infringing file, so the product goes too.
      await prisma.product.deleteMany({ where: { filePath } });
      break;
  }

  // Remove the live copy from the storage provider (best-effort on disk).
  if (kind === "SHOP_PRODUCT") {
    void deleteProductUpload(path.basename(filePath)).catch(() => undefined);
  } else {
    void deleteUpload(path.basename(filePath)).catch(() => undefined);
  }

  await prisma.mediaFile.delete({ where: { id } });
}

export interface TakedownInput {
  /** MediaFile ids the operator selected. Copies sharing the same hash are
   * pulled in automatically, so one selection bans every account's copy. */
  mediaFileIds: string[];
  /** Report to adopt + mark TAKEN_DOWN, when the takedown came from a report. */
  reportId?: string | null;
  /** True (default) also disables the accounts that owned a matched file. */
  disableAccount?: boolean;
  /** Operator note attached to the report (when a report is adopted). */
  note?: string;
  /** Reason tag stored on each new BannedHash row. Defaults to "dmca". */
  reason?: string;
  /** The admin performing the takedown (bannedBy / handledBy). */
  adminId: string;
}

export interface TakedownResult {
  filesRemoved: number;
  hashesBanned: number;
  accountsDisabled: string[];
}

/**
 * Execute a takedown:
 *
 *   1. resolve the selected files AND every other stored file sharing their
 *      SHA-256 / perceptual hash (another account's copy of the same file);
 *   2. delete each live file + clear the owning model references;
 *   3. register permanent BannedHash rows (exact + perceptual);
 *   4. disable every account that owned a matching file (unless instructed);
 *   5. mark the linked report TAKEN_DOWN.
 */
export async function execTakedown(input: TakedownInput): Promise<TakedownResult> {
  const ids = [...new Set(input.mediaFileIds.map((s) => s.trim()).filter(Boolean))];
  if (!ids.length) throw new TakedownValidationError("Select at least one file to take down.");

  const selected = await prisma.mediaFile.findMany({ where: { id: { in: ids } } });
  if (!selected.length) throw new TakedownValidationError("None of the selected files were found.");

  const report = input.reportId
    ? await prisma.dmcaReport.findUnique({ where: { id: input.reportId } })
    : null;
  if (input.reportId && !report) throw new TakedownValidationError("Report not found.");

  // Expand to every stored copy of the same content across all accounts.
  const sha256s = [...new Set(selected.map((f) => f.sha256))];
  const hashes = [...new Set(selected.map((f) => f.pHashHex).filter((h): h is string => Boolean(h)))];
  const targets = await prisma.mediaFile.findMany({
    where: {
      OR: [{ sha256: { in: sha256s } }, ...(hashes.length ? [{ pHashHex: { in: hashes } }] : [])],
    },
  });

  for (const media of targets) {
    await removeMediaFile(media);
  }

  // One BannedHash row per distinct exact hash, carrying its perceptual twin.
  const bySha = new Map<string, string | null>();
  for (const media of targets) {
    if (!bySha.has(media.sha256)) bySha.set(media.sha256, media.pHashHex ?? null);
    else if (bySha.get(media.sha256) === null && media.pHashHex) bySha.set(media.sha256, media.pHashHex);
  }

  const disableAccountFlag = input.disableAccount !== false;
  // Sanitize once: the reason is a free-text operator note on manual takedowns.
  const reason = input.reason ? sanitizeDmcaText(input.reason, DMCA_NOTE_MAX) : "dmca";
  const banned = await prisma.bannedHash.createMany({
    data: [...bySha.entries()].map(([sha256, phash]) => ({
      sha256,
      pHashHex: phash,
      reason,
      dmcaReportId: report?.id ?? null,
      bannedById: input.adminId,
    })),
  });

  const ownerIds = [...new Set(targets.map((f) => f.userId))];
  const accountsDisabled: string[] = [];
  if (disableAccountFlag) {
    for (const userId of ownerIds) {
      // Record the same reason that lands on the hash ban, so the disabled
      // queue explains a manual takedown as clearly as a reported one.
      await disableAccount(userId, reason);
      accountsDisabled.push(userId);
    }
  }

  if (report) {
    await prisma.dmcaReport.update({
      where: { id: report.id },
      data: {
        status: "TAKEN_DOWN",
        handledById: input.adminId,
        handledAt: new Date(),
        decisionNote: input.note ? sanitizeDmcaText(input.note, DMCA_NOTE_MAX) : report.decisionNote,
      },
    });
  }

  return { filesRemoved: targets.length, hashesBanned: banned.count, accountsDisabled };
}

/* ---------------------------------------------------------------------------
 * Manual moderation (report-less)
 * ------------------------------------------------------------------------- */

const SHA256_HEX = /^[0-9a-f]{64}$/;
const PHASH_HEX = /^[0-9a-f]{16}$/;

export interface HashBanInput {
  /** Exact 64-hex content hash. */
  sha256: string;
  /** Optional 16-hex perceptual (DCT) hash, so near-twins are blocked too. */
  pHashHex?: string;
  /** Optional operator note; stored as the ban's reason. */
  note?: string;
  adminId: string;
}

/**
 * Ban a hash directly, with no report behind it — operator judgement or a
 * pre-emptive block on bytes that are not uploaded yet. Blocks any future
 * upload whose bytes (or perceptual twin) match. Refuses a hash that already
 * has a live ban so the list stays truthful rather than stacking duplicates.
 */
export async function banHash(input: HashBanInput): Promise<{ id: string }> {
  const sha256 = input.sha256.trim().toLowerCase();
  if (!SHA256_HEX.test(sha256)) {
    throw new TakedownValidationError("A SHA-256 hash must be 64 hexadecimal characters.");
  }
  const pHashHex = input.pHashHex?.trim().toLowerCase() || null;
  if (pHashHex && !PHASH_HEX.test(pHashHex)) {
    throw new TakedownValidationError("A perceptual hash must be 16 hexadecimal characters.");
  }

  const existing = await prisma.bannedHash.findFirst({
    where: { sha256, unbannedAt: null },
    select: { id: true },
  });
  if (existing) throw new TakedownConflictError("This hash already has an active ban.");

  const clean = input.note ? sanitizeDmcaText(input.note, DMCA_NOTE_MAX) : "";
  const created = await prisma.bannedHash.create({
    data: {
      sha256,
      pHashHex,
      reason: clean || "manual",
      dmcaReportId: null,
      bannedById: input.adminId,
    },
    select: { id: true },
  });
  return { id: created.id };
}

/**
 * Take down every media file owned by one user — the profile-level action.
 * Reuses `execTakedown` so expanding to other accounts' copies of the same
 * bytes and registering the hash bans behave exactly like a report takedown.
 */
export async function takedownAllMediaOfUser(
  ownerUserId: string,
  input: { note?: string; disableAccount?: boolean; reason?: string; adminId: string },
): Promise<TakedownResult> {
  const files = await prisma.mediaFile.findMany({ where: { userId: ownerUserId }, select: { id: true } });
  if (!files.length) throw new TakedownValidationError("This account has no uploaded media to take down.");
  return execTakedown({
    mediaFileIds: files.map((f) => f.id),
    note: input.note,
    disableAccount: input.disableAccount,
    reason: input.reason ?? "manual",
    adminId: input.adminId,
  });
}

/* ---------------------------------------------------------------------------
 * Report review (admin)
 * ------------------------------------------------------------------------- */

/** Every terminal outcome a claimant is told about by e-mail. */
type ClaimantOutcome = "DISMISSED" | "TAKEN_DOWN" | "COUNTER_NOTICE";

const OUTCOME_COPY: Record<ClaimantOutcome, { subject: string; headline: string }> = {
  DISMISSED: {
    subject: "[DMCA] Your takedown report was reviewed",
    headline: "Your report was reviewed and dismissed.",
  },
  TAKEN_DOWN: {
    subject: "[DMCA] Action taken on your takedown report",
    headline: "The material in your report was removed.",
  },
  COUNTER_NOTICE: {
    subject: "[DMCA] A counter-notice was filed for your report",
    headline:
      "The reported party submitted a counter-notice. The affected files are no longer blocked.",
  },
};

/**
 * Tell the claimant what happened to their notice.
 *
 * § 512 practice: the outcome reaches the address written ON THE NOTICE — an
 * anonymous filing still supplied `claimantEmail`, and that address is the only
 * identity it has. Deliberately NOT scoped to signed-in filers, who are often
 * not the rights holder. Best-effort like every other notice here: SMTP trouble
 * must never fail an operator's review.
 */
async function notifyClaimantOfOutcome(
  report: Pick<DmcaReport, "id" | "claimantName" | "claimantEmail" | "workUrl">,
  outcome: ClaimantOutcome,
  note?: string,
): Promise<void> {
  if (!isEmailEnabled()) return;
  const to = report.claimantEmail.trim();
  if (!to) return;

  const copy = OUTCOME_COPY[outcome];
  const cleanedNote = note ? sanitizeDmcaText(note, DMCA_NOTE_MAX) : "";
  await sendEmail({
    to,
    subject: copy.subject,
    html: `
      <p>Dear ${escapeHtml(report.claimantName)},</p>
      <p>${escapeHtml(copy.headline)}</p>
      <p><strong>Report:</strong> ${escapeHtml(report.id)}<br/>
      <strong>Work claimed:</strong> ${escapeHtml(report.workUrl)}</p>
      ${cleanedNote ? `<p><strong>Operator note:</strong><br/>${escapeHtml(cleanedNote)}</p>` : ""}
      <p>If you need to respond, reply to this message quoting the report number.</p>
    `,
  }).catch((error) => {
    console.error(`Failed to e-mail claimant about DMCA ${outcome}:`, error);
  });
}

/** Fetch a report or throw the shared validation error (400 at the route). */
async function requireReport(reportId: string): Promise<DmcaReport> {
  const report = await prisma.dmcaReport.findUnique({ where: { id: reportId } });
  if (!report) throw new TakedownValidationError("Report not found.");
  return report;
}

/**
 * Dismiss a report: record the decision on the row and tell the claimant.
 *
 * A dismissed report never issued hash bans (bans only exist once
 * `execTakedown` ran), so dismissal is purely a record + notice.
 */
export async function dismissReport(reportId: string, adminId: string, note: string): Promise<void> {
  const report = await requireReport(reportId);
  if (report.status === "TAKEN_DOWN") {
    throw new TakedownValidationError("A takedown cannot be dismissed — the files are already gone.");
  }

  const clean = sanitizeDmcaText(note, DMCA_NOTE_MAX);
  await prisma.dmcaReport.update({
    where: { id: reportId },
    data: {
      status: "DISMISSED",
      handledById: adminId,
      handledAt: new Date(),
      decisionNote: clean || report.decisionNote,
    },
  });
  await notifyClaimantOfOutcome(report, "DISMISSED", clean);
}

/**
 * Record a counter-notice from the reported party and lift the hash bans this
 * report issued.
 *
 * Two deliberate limits: the bans go, the ACCOUNTS DO NOT come back (§ 512(g)
 * re-activation stays an operator decision — see `reactivateAccount`), and the
 * report itself is kept for the record rather than deleted.
 */
export async function recordCounterNotice(reportId: string, text: string, adminId: string): Promise<void> {
  const report = await requireReport(reportId);
  const clean = sanitizeDmcaText(text, DMCA_APPEAL_MAX);
  if (!clean) throw new TakedownValidationError("Counter-notice text is required.");

  const at = new Date();
  await prisma.$transaction([
    prisma.bannedHash.updateMany({
      where: { dmcaReportId: reportId, unbannedAt: null },
      data: { unbannedAt: at, unbannedById: adminId },
    }),
    prisma.dmcaReport.update({
      where: { id: reportId },
      data: { status: "COUNTER_NOTICE", counterNotice: clean, counterNoticeAt: at },
    }),
  ]);
  await notifyClaimantOfOutcome(report, "COUNTER_NOTICE");
}

/**
 * Delete a report row outright.
 *
 * `banned_hashes.dmca_report_id` carries no `ON DELETE` action (see
 * docs/migrations/2026-10-08_dmca-takedowns.sql), so the foreign key blocks a
 * plain delete — and nulling it while leaving the ban active would produce
 * exactly the unreviewable permanent ban the operator rejected. Hence, in one
 * transaction: lift every ban still in force, detach them from the report, then
 * delete the report.
 */
export async function deleteReport(reportId: string, adminId: string): Promise<{ hashesUnbanned: number }> {
  await requireReport(reportId);
  const at = new Date();

  const [unbanned] = await prisma.$transaction([
    prisma.bannedHash.updateMany({
      where: { dmcaReportId: reportId, unbannedAt: null },
      data: { unbannedAt: at, unbannedById: adminId },
    }),
    prisma.bannedHash.updateMany({ where: { dmcaReportId: reportId }, data: { dmcaReportId: null } }),
    prisma.dmcaReport.delete({ where: { id: reportId } }),
  ]);
  return { hashesUnbanned: unbanned.count };
}

/* ---------------------------------------------------------------------------
 * Appeals + disabled status + purge
 * ------------------------------------------------------------------------- */

/** The disabled/appeal state the SPA renders for a signed-in account. */
export async function disabledStateFor(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { disabledAt: true, disabledReason: true, appealSubmittedAt: true, appealText: true },
  });
  if (!user?.disabledAt) return { disabled: false } as const;
  return {
    disabled: true,
    disabledAt: user.disabledAt,
    disabledReason: user.disabledReason ?? "dmca",
    appealSubmittedAt: user.appealSubmittedAt,
    appealText: user.appealText,
  } as const;
}

/** Record an appeal from a disabled account holder. Throws when not disabled. */
export async function submitAppeal(userId: string, text: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { disabledAt: true } });
  if (!user?.disabledAt) throw new TakedownValidationError("This account is not disabled.");

  const clean = sanitizeDmcaText(text, DMCA_APPEAL_MAX);
  if (!clean) throw new TakedownValidationError("Appeal text is required.");

  await prisma.user.update({
    where: { id: userId },
    data: { appealText: clean, appealSubmittedAt: new Date() },
  });
}

/**
 * Delete every account whose disable window elapsed without a re-activation.
 *
 * A pending, not-yet-reviewed appeal pauses the clock: the user did everything
 * they could and the operator merely has not responded, so an active appeal is
 * never destroyed silently. Only absence of re-activation AND no open appeal
 * triggers deletion. Returns the number of accounts deleted.
 */
export async function purgeDisabledAccounts(now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - dmcaGraceDays() * 24 * 60 * 60 * 1000);
  const candidates = await prisma.user.findMany({
    where: {
      disabledAt: { not: null, lt: cutoff },
      OR: [{ appealReviewedAt: { not: null } }, { appealSubmittedAt: null }],
    },
    select: { id: true },
  });

  let deleted = 0;
  for (const { id } of candidates) {
    try {
      await deleteUserCompletely(id);
      deleted += 1;
    } catch (error) {
      console.error(`Failed to purge disabled account ${id}:`, error);
    }
  }
  return deleted;
}