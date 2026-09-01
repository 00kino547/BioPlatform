import { randomBytes } from "crypto";
import { resolveTxt } from "dns/promises";
import type { CustomDomainStatus, Prisma, User } from "@prisma/client";
import { getEnv } from "../config/env.js";
import { hasPermission, PERMISSIONS, type RoleInfo } from "./permissions.js";

const HOSTNAME_RE = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const TXT_LOOKUP_TIMEOUT_MS = 10_000;

export type CustomDomainGate = { allowed: boolean; reason: string | null };

export function gateCustomDomain(role: RoleInfo | null | undefined, tier: string): CustomDomainGate {
  if (!hasPermission(role, PERMISSIONS.PROFILES_CUSTOM_DOMAIN)) {
    return { allowed: false, reason: "Your role does not have the custom domain permission." };
  }
  if (!getEnv().CUSTOM_DOMAINS_ALL_TIERS && tier !== "PRO" && tier !== "ENTERPRISE") {
    return { allowed: false, reason: "Custom domains require a PRO or ENTERPRISE tier." };
  }
  return { allowed: true, reason: null };
}

export function gateCustomDomainForUser(user: Pick<User, "tier"> & { role?: RoleInfo | null }): CustomDomainGate {
  return gateCustomDomain(user.role ?? null, user.tier);
}

export function appHosts(): string[] {
  const host = new URL(getEnv().APP_URL).hostname.toLowerCase().replace(/\.$/, "");
  return [host, host.startsWith("www.") ? host.slice(4) : `www.${host}`];
}

export function isAppHost(host: string): boolean {
  const normalized = normalizeHostname(host);
  return appHosts().includes(normalized);
}

export function normalizeHostname(host: string): string {
  let value = host.trim().toLowerCase();
  if (value.includes("://")) {
    try {
      value = new URL(value).hostname;
    } catch {
      value = value.split("/")[0].split(":")[0];
    }
  }
  value = value.split("/")[0].split(":")[0];
  value = value.replace(/\.$/, "");
  return value;
}

export function validateDomain(value: string): string | null {
  const normalized = normalizeHostname(value);
  if (!HOSTNAME_RE.test(normalized)) return null;
  if (normalized.length < 4 || normalized.length > 253) return null;
  if (isAppHost(normalized)) return null;
  if (normalized.startsWith("www.")) return null;
  return normalized;
}

export function generateVerificationToken(): string {
  return `bioplatform-verify=${randomBytes(24).toString("hex")}`;
}

export function verifyTxtRecordName(domain: string): string {
  return `_bioplatform.${domain}`;
}

export async function checkDomainTxt(domain: string, token: string): Promise<boolean> {
  const expected = token.toLowerCase();
  const lookup = resolveTxt(verifyTxtRecordName(domain))
    .then((records) => records.some((chunks) => chunks.join("").toLowerCase() === expected))
    .catch(() => false);
  const timed = await Promise.race([
    lookup,
    new Promise<false>((resolve) => setTimeout(() => resolve(false), TXT_LOOKUP_TIMEOUT_MS)),
  ]);
  return timed;
}

export function publicProfileWhere(slug: string): Prisma.ProfileWhereInput {
  return { slug, isPublic: true };
}

export const CUSTOM_DOMAIN_STATUSES: CustomDomainStatus[] = [
  "PENDING_VERIFICATION",
  "VERIFIED",
  "ACTIVE",
  "REJECTED",
];
