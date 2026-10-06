import type { ReactNode } from "react";
import type { PolicyContext } from "@/lib/api";

// Pure text/label helpers shared by the /privacy and /terms pages.
//
// These live apart from PolicyShell.tsx on purpose: that file exports a React
// component, and the repo's eslint config (react-refresh/only-export-components)
// warns when a component module also exports plain functions.

// Shared chrome for /privacy and /terms.
//
// Both pages describe what THIS deployment actually does, driven by the public
// `GET /api/policy/context` snapshot (see apps/backend/src/lib/policyContext.ts).
// The rules the two pages follow:
//
//   1. ctx === null  -> render the neutral "the instance operator may ..." wording.
//      The context is still loading, or the endpoint failed. We must never claim
//      a service is running when we could not find out, and we must never hide
//      one that is running either, so this branch stays deliberately vague.
//   2. ctx loaded    -> state the fact plainly ("This instance runs Matomo on its
//      own infrastructure", "Sign-in via PocketBase is enabled on this instance").
//
// Subsection numbers are assigned from the *rendered* list, so removing a section
// for a disabled capability renumbers the rest instead of leaving a gap or a
// stale 5j-before-5i ordering.

/** "2026-09-30" -> "September 30, 2026". Falls back to the raw value. */
export function formatPolicyDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return iso;
  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** Human label for a storage backend, used in the uploads + retention wording. */
export function storageLabel(provider: string): string {
  switch (provider) {
    case "local":
      return "storage attached to this instance's own server";
    case "r2":
      return "Cloudflare R2 object storage";
    case "b2":
      return "Backblaze B2 object storage";
    case "s3":
      return "an S3-compatible object store";
    default:
      return "this instance's configured file storage";
  }
}

/** Human label for the captcha provider, or null when captcha is off. */
export function captchaLabel(ctx: PolicyContext): string | null {
  if (!ctx.captcha.enabled) return null;
  switch (ctx.captcha.provider) {
    case "turnstile":
      return "Cloudflare Turnstile";
    case "recaptcha":
      return "Google reCAPTCHA";
    case "hcaptcha":
      return "hCaptcha";
    default:
      return null;
  }
}

const SSO_LABELS: Record<string, string> = {
  google: "Google",
  github: "GitHub",
  discord: "Discord",
};

/** "Google and GitHub" / "Google, GitHub and Discord" / "" when none. */
export function ssoProviderList(ctx: PolicyContext): string {
  const names = ctx.auth.sso.map((p) => SSO_LABELS[p] ?? p);
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** Payment processors this instance can actually route a payment through. */
export function paymentProviderList(ctx: PolicyContext): string[] {
  const out: string[] = [];
  if (ctx.payments.stripe) out.push("Stripe");
  if (ctx.payments.paypal) out.push(`PayPal (${ctx.payments.paypalMode === "live" ? "live" : "sandbox"})`);
  if (ctx.payments.crypto && ctx.payments.cryptoCoins.length > 0) {
    out.push(`cryptocurrency through a self-hosted gateway (${ctx.payments.cryptoCoins.join(", ")})`);
  }
  return out;
}

/** "Stripe, PayPal (sandbox) and a self-hosted gateway" for prose. */
export function proseList(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

export interface PolicySection {
  /** Stable id, also used as the React key. */
  id: string;
  title: string;
  /**
   * Body paragraphs. Each string becomes its own <p>. Use real Unicode
   * punctuation (’ “ ”) here, NOT HTML entities: React does not decode entities
   * inside interpolated strings, so `&rsquo;` would render literally.
   */
  paragraphs: string[];
  /** Rendered instead of `paragraphs` when set (used for links / rich bodies). */
  node?: ReactNode;
  /** Optional extra nodes rendered after the paragraphs (lists, code, links). */
  extra?: ReactNode;
}

/**
 * A capability that may be absent from this deployment.
 *
 * The legal pages describe only what the instance actually does. When a
 * capability is switched off its section/paragraph is `null` and gets dropped
 * here, so the page reads as though the feature never existed — there is no
 * "this instance does not support X" wording anywhere.
 */
export type Maybe<T> = T | null;

/**
 * Drops absent entries so a missing capability leaves no trace in the output.
 * Used for both paragraph lists and whole sections.
 */
export function compact<T>(items: readonly Maybe<T>[]): T[] {
  return items.filter((item): item is T => item !== null && item !== undefined);
}

/**
 * Builds a paragraph list from paragraphs that may be absent, e.g. a sentence
 * that only applies when a capability is enabled.
 */
export function paras(...items: Maybe<string>[]): string[] {
  return compact(items);
}


