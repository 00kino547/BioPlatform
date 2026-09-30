import jwt from "jsonwebtoken";
import { type Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "./prisma.js";
import { getEnv } from "../config/env.js";
import { sendEmail, isEmailEnabled } from "./email.js";

type Db = Prisma.TransactionClient | PrismaClient;

export const NEWSLETTER_TIER_CONFIG_KEY = "newsletter.tierConfig";

// Policy versions recorded on the consent record (must match the frontend
// /privacy + /terms "Last updated" dates).
export const POLICY_VERSIONS = {
  tos: "2026-09-30",
  privacy: "2026-09-30",
} as const;

// Deemed acceptance: a user who keeps using the platform more than 30 days
// after a new version's effective date without checking for an update is
// deemed to have accepted it (see Terms §14 / Privacy §8). Continued use is
// proven by the user's most recent login (User.lastLoginAt).
export const DEEMED_ACCEPTANCE_DAYS = 30;

/** Effective date of the current policy versions (used for deemed acceptance). */
export function policyEffectiveDate(): Date {
  return new Date(`${POLICY_VERSIONS.tos}T00:00:00.000Z`);
}

/** Date on which a user who logged in on/after `effectiveDate` is deemed to
 * have accepted the updated policy (effective + 30 days). */
export function deemedAcceptanceCutoff(effectiveDate: Date): Date {
  return new Date(effectiveDate.getTime() + DEEMED_ACCEPTANCE_DAYS * 24 * 60 * 60 * 1000);
}

export interface ConsentPins {
  tosVersion: string | null | undefined;
  privacyVersion: string | null | undefined;
  lastLoginAt: Date | null | undefined;
}

/** True when the user is current on consent: either they explicitly pinned the
 * current versions, or they are deemed to have accepted them by continued use
 * (last login >= 30 days after the effective date). */
export function consentCurrent(pins: ConsentPins): boolean {
  if (
    pins.tosVersion === POLICY_VERSIONS.tos &&
    pins.privacyVersion === POLICY_VERSIONS.privacy
  ) {
    return true;
  }
  if (!pins.lastLoginAt) return false;
  return pins.lastLoginAt >= deemedAcceptanceCutoff(policyEffectiveDate());
}


export interface TierNewsletterConfig {
  sendLimit: number;
  windowHours: number;
}

export type NewsletterTierConfig = Record<"FREE" | "PRO" | "ENTERPRISE", TierNewsletterConfig>;

export const DEFAULT_TIER_CONFIG: NewsletterTierConfig = {
  FREE: { sendLimit: 0, windowHours: 24 },
  PRO: { sendLimit: 1, windowHours: 24 },
  ENTERPRISE: { sendLimit: 5, windowHours: 24 },
};

export function parseTierConfigJson(raw: string | null | undefined): NewsletterTierConfig | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const asRecord = parsed as Record<string, unknown>;

  const clean = (tier: string): TierNewsletterConfig | null => {
    const v = asRecord[tier];
    if (typeof v !== "object" || v === null) return null;
    const { sendLimit, windowHours } = v as Record<string, unknown>;
    if (!Number.isInteger(sendLimit) || (sendLimit as number) < 0 || (sendLimit as number) > 100) return null;
    if (!Number.isInteger(windowHours) || (windowHours as number) < 1 || (windowHours as number) > 8760) return null;
    return { sendLimit: sendLimit as number, windowHours: windowHours as number };
  };

  const FREE = clean("FREE");
  const PRO = clean("PRO");
  const ENTERPRISE = clean("ENTERPRISE");
  if (!FREE || !PRO || !ENTERPRISE) return null;
  return { FREE, PRO, ENTERPRISE };
}

export async function effectiveTierConfig(
  db: Db = prisma
): Promise<{ source: "env" | "db"; config: NewsletterTierConfig }> {
  const setting = await db.systemSetting.findUnique({ where: { key: NEWSLETTER_TIER_CONFIG_KEY } });
  if (!setting?.value) return { source: "env", config: DEFAULT_TIER_CONFIG };
  const parsed = parseTierConfigJson(setting.value);
  if (!parsed) return { source: "env", config: DEFAULT_TIER_CONFIG };
  return { source: "db", config: parsed };
}

export async function setTierConfig(config: NewsletterTierConfig): Promise<void> {
  const clean: NewsletterTierConfig = {
    FREE: { sendLimit: config.FREE.sendLimit, windowHours: config.FREE.windowHours },
    PRO: { sendLimit: config.PRO.sendLimit, windowHours: config.PRO.windowHours },
    ENTERPRISE: { sendLimit: config.ENTERPRISE.sendLimit, windowHours: config.ENTERPRISE.windowHours },
  };
  await prisma.systemSetting.upsert({
    where: { key: NEWSLETTER_TIER_CONFIG_KEY },
    update: { value: JSON.stringify(clean) },
    create: { key: NEWSLETTER_TIER_CONFIG_KEY, value: JSON.stringify(clean) },
  });
}

export async function resetTierConfig(): Promise<void> {
  await prisma.systemSetting.deleteMany({ where: { key: NEWSLETTER_TIER_CONFIG_KEY } });
}

// ---- Transient consent evidence (GDPR/CASL accountability) ------------------
// IP + User-Agent are captured at the moment of subscribing so an admin can
// verify an opt-in, kept only in memory with a 24 h TTL, and never written to
// the database. The permanent subscriber row keeps only email + timestamps +
// policy versions (data minimization).

export interface ConsentEvent {
  email: string;
  profileId: string;
  ip: string;
  userAgent: string;
  at: Date;
}

const CONSENT_EVIDENCE_TTL_MS = 24 * 60 * 60 * 1000;
const consentEvidence = new Map<string, ConsentEvent>();

export function recordConsentEvidence(
  email: string,
  profileId: string,
  ip: string | undefined,
  userAgent: string | undefined
): void {
  const at = new Date();
  consentEvidence.set(`${profileId}:${email}`, {
    email,
    profileId,
    ip: ip ?? "",
    userAgent: userAgent ?? "",
    at,
  });
}

export function searchConsentEvidence(email: string): ConsentEvent[] {
  const now = Date.now();
  const matches: ConsentEvent[] = [];
  for (const [key, event] of consentEvidence) {
    if (now - event.at.getTime() > CONSENT_EVIDENCE_TTL_MS) {
      consentEvidence.delete(key);
      continue;
    }
    if (event.email.toLowerCase() === email.toLowerCase()) matches.push({ ...event });
  }
  return matches.sort((a, b) => b.at.getTime() - a.at.getTime());
}

const consentPruneTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, event] of consentEvidence) {
    if (now - event.at.getTime() > CONSENT_EVIDENCE_TTL_MS) consentEvidence.delete(key);
  }
}, 6 * 60 * 60 * 1000);
consentPruneTimer.unref();

// ---- Unsubscribe (one-click, signed) ---------------------------------------

interface UnsubscribePayload {
  profileId: string;
  email: string;
  purpose: "newsletter_unsubscribe";
}

export function signUnsubscribeToken(profileId: string, email: string): string {
  const payload: UnsubscribePayload = { profileId, email, purpose: "newsletter_unsubscribe" };
  return jwt.sign(payload, getEnv().JWT_SECRET, {
    expiresIn: `${getEnv().NEWSLETTER_UNSUBSCRIBE_TTL_DAYS}d`,
  });
}

export function verifyUnsubscribeToken(token: string): { profileId: string; email: string } | null {
  try {
    const payload = jwt.verify(token, getEnv().JWT_SECRET) as UnsubscribePayload;
    if (payload.purpose !== "newsletter_unsubscribe") return null;
    if (typeof payload.profileId !== "string" || typeof payload.email !== "string") return null;
    return { profileId: payload.profileId, email: payload.email };
  } catch {
    return null;
  }
}

export function unsubscribeUrl(token: string): string {
  const origin = getEnv().CORS_ORIGIN.split(",")[0]?.trim() || getEnv().APP_URL;
  return `${origin.replace(/\/+$/, "")}/api/newsletter/unsubscribe?token=${encodeURIComponent(token)}`;
}

export function buildUnsubscribeUrl(profileId: string, email: string): string {
  return unsubscribeUrl(signUnsubscribeToken(profileId, email));
}

interface BroadcastUnsubscribePayload {
  userId: string;
  purpose: "broadcast_unsubscribe";
}

export function signBroadcastUnsubscribeToken(userId: string): string {
  const payload: BroadcastUnsubscribePayload = { userId, purpose: "broadcast_unsubscribe" };
  return jwt.sign(payload, getEnv().JWT_SECRET, {
    expiresIn: `${getEnv().NEWSLETTER_UNSUBSCRIBE_TTL_DAYS}d`,
  });
}

export function verifyBroadcastUnsubscribeToken(token: string): string | null {
  try {
    const payload = jwt.verify(token, getEnv().JWT_SECRET) as BroadcastUnsubscribePayload;
    if (payload.purpose !== "broadcast_unsubscribe") return null;
    if (typeof payload.userId !== "string") return null;
    return payload.userId;
  } catch {
    return null;
  }
}

export function broadcastUnsubscribeUrl(token: string): string {
  const origin = getEnv().CORS_ORIGIN.split(",")[0]?.trim() || getEnv().APP_URL;
  return `${origin.replace(/\/+$/, "")}/api/newsletter/unsubscribe/broadcast?token=${encodeURIComponent(token)}`;
}

// ---- Send -------------------------------------------------------------------

export function isNewsletterSendEnabled(): boolean {
  const env = getEnv();
  if (env.NEWSLETTER_PROVIDER === "resend" && env.RESEND_API_KEY) return true;
  return isEmailEnabled();
}

async function sendViaResend(options: {
  from: string;
  to: string;
  subject: string;
  html: string;
  listUnsubscribe?: string;
}): Promise<{ success: boolean; error?: string }> {
  const env = getEnv();
  const headers: Record<string, string> = { "X-Priority": "3", "Precedence": "bulk" };
  if (options.listUnsubscribe) {
    headers["List-Unsubscribe"] = `<${options.listUnsubscribe}>`;
    headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: options.from,
        to: options.to,
        subject: options.subject,
        html: options.html,
        headers,
      }),
    });
    if (!res.ok) {
      const body = (await res.text()).slice(0, 500);
      return { success: false, error: `Resend API ${res.status}: ${body}` };
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Resend request failed" };
  }
}

export function resendFromAddress(): string {
  const env = getEnv();
  if (env.RESEND_FROM) return env.RESEND_FROM;
  const from = env.SMTP_FROM_EMAIL || env.SMTP_USER;
  return `"${env.SMTP_FROM_NAME}" <${from}>`;
}

export async function sendNewsletterEmail(options: {
  to: string;
  subject: string;
  html: string;
  listUnsubscribe?: string;
}): Promise<{ success: boolean; error?: string }> {
  const env = getEnv();
  if (env.NEWSLETTER_PROVIDER === "resend" && env.RESEND_API_KEY) {
    return sendViaResend({ from: resendFromAddress(), ...options });
  }
  return sendEmail(options);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildNewsletterEmail(opts: {
  appName: string;
  fromName: string;
  fromEmail: string;
  subject: string;
  body: string;
  unsubscribeUrl: string;
  mailingAddress: string;
  website: string;
}): string {
  const senderLine = `${escapeHtml(opts.fromName)} &lt;${escapeHtml(opts.fromEmail)}&gt;`;
  const addressLine = escapeHtml(opts.mailingAddress || opts.website);
  return `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"></head>
    <body style="margin:0;padding:0;background-color:#09090b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
      <div style="max-width:480px;margin:40px auto;background:#18181b;border-radius:12px;border:1px solid #27272a;overflow:hidden;">
        <div style="background:linear-gradient(135deg,#7c3aed,#0ea5e9);padding:24px;text-align:center;">
          <h1 style="color:#fff;margin:0;font-size:18px;">${escapeHtml(opts.appName)}</h1>
        </div>
        <div style="padding:24px;">
          <h2 style="color:#e4e4e7;font-size:16px;margin:0 0 12px;">${escapeHtml(opts.subject)}</h2>
          <div style="color:#a1a1aa;font-size:14px;line-height:1.7;margin:0 0 20px;white-space:pre-wrap;">${escapeHtml(opts.body)}</div>
          <p style="color:#a1a1aa;font-size:13px;line-height:1.6;margin:0 0 8px;">
            You are receiving this newsletter because you subscribed to it and agreed to the
            platform Terms of Service and Privacy Policy.
          </p>
          <p style="color:#a1a1aa;font-size:13px;line-height:1.6;margin:0;">
            <a href="${opts.unsubscribeUrl}" style="color:#7c3aed;">Unsubscribe from this newsletter</a> —
            you can opt out at any time, no fee, one click.
          </p>
        </div>
        <div style="padding:16px 24px;border-top:1px solid #27272a;text-align:center;">
          <p style="color:#52525b;font-size:11px;margin:0;">
            Sent by ${senderLine}<br/>
            ${addressLine}
          </p>
        </div>
      </div>
    </body>
    </html>
  `;
}

export function stripHtmlInput(value: string): string {
  return value.replace(/[<>{}]/g, "").replace(/\s+/g, " ").trim();
}