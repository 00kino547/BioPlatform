import type { IncomingHttpHeaders } from "node:http";

export const CONSENT_COOKIE = "bp_consent";
export const ANALYTICS_COOKIE = "bp_vid";

export type ConsentStatus = "accept" | "essential" | "unknown";

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const name = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (!name) continue;
    try {
      out[name] = decodeURIComponent(value);
    } catch {
      out[name] = value;
    }
  }
  return out;
}

// Honours "Do Not Track" (DNT: 1) and the Global Privacy Control (Sec-GPC: 1)
// signals by default. When either is present we treat the visitor as
// essential-only and never record analytics, even if a previous accept
// decision was stored.
export function privacyRequested(headers: IncomingHttpHeaders): boolean {
  const dnt = headers["dnt"];
  const secGpc = headers["sec-gpc"];
  const dntFlag =
    dnt !== undefined && (Array.isArray(dnt) ? dnt.some((v) => v.trim() === "1") : dnt.trim() === "1");
  const gpcFlag =
    secGpc !== undefined && (Array.isArray(secGpc) ? secGpc.some((v) => v.trim() === "1") : secGpc.trim() === "1");
  return dntFlag || gpcFlag;
}

export function consentFromRequest(headers: IncomingHttpHeaders): ConsentStatus {
  const cookies = parseCookies(headers.cookie);
  const stored = cookies[CONSENT_COOKIE];
  const status: ConsentStatus = stored === "accept" || stored === "essential" ? stored : "unknown";
  if (privacyRequested(headers)) return "essential";
  return status;
}

export function analyticsAllowed(headers: IncomingHttpHeaders): boolean {
  if (privacyRequested(headers)) return false;
  return parseCookies(headers.cookie)[CONSENT_COOKIE] === "accept";
}