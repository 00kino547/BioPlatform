import { randomUUID, createHash } from "crypto";
import type { Request, Response } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "./prisma.js";
import { getEnv } from "../config/env.js";

export const AUTH_COOKIE = "bio_sid";

export const MAX_FREE_ATTEMPTS = 3;
export const PERMANENT_AFTER_FAILS = 10;
export const LOCKOUT_STEP_MS = 10 * 60 * 1000;
export const LOCKOUT_HOUR_STEP_MS = 60 * 60 * 1000;
export const TRUSTED_IP_MAX_LOCKOUT_MS = 60 * 60 * 1000;
export const AUTH_COOKIE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type FingerprintKind = "IP" | "COOKIE" | "UA" | "ACCOUNT";

export interface Fingerprint {
  ip: string;
  cookie: string;
  userAgent: string;
}

export interface BlockResult {
  permanent: boolean;
  retryAfterSeconds: number | null;
}

declare global {
  namespace Express {
    interface Request {
      authFingerprint?: Fingerprint;
    }
  }
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeIp(ip: string): string {
  return ip.replace(/^::ffff:/, "").trim();
}

function getCookie(req: Request, name: string): string | null {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) {
      return decodeURIComponent(part.slice(idx + 1).trim());
    }
  }
  return null;
}

export function fingerprintFromRequest(req: Request, res: Response): Fingerprint {
  const ip = normalizeIp(req.ip ?? "");
  const userAgent = String(req.headers["user-agent"] ?? "unknown").slice(0, 512);

  const existing = getCookie(req, AUTH_COOKIE);
  if (existing && existing.length > 0 && existing.length <= 200) {
    return { ip, cookie: sha256(existing), userAgent };
  }

  const value = randomUUID();
  res.cookie(AUTH_COOKIE, value, {
    httpOnly: true,
    secure: req.secure,
    sameSite: "lax",
    maxAge: AUTH_COOKIE_TTL_MS,
    path: "/",
  });

  return { ip, cookie: sha256(value), userAgent };
}

export function lockoutDuration(failCount: number): number | null {
  if (failCount <= MAX_FREE_ATTEMPTS) return 0;
  if (failCount > PERMANENT_AFTER_FAILS) return null;
  const extra = failCount - MAX_FREE_ATTEMPTS;
  const stepTen = Math.min(extra, 2) * LOCKOUT_STEP_MS;
  const stepHour = Math.max(extra - 2, 0) * LOCKOUT_HOUR_STEP_MS;
  return stepTen + stepHour;
}

interface BlockRow {
  permanent: boolean;
  lockedUntil: Date | null;
}

function isBlocked(row: BlockRow, now = Date.now()): boolean {
  return row.permanent || (row.lockedUntil !== null && row.lockedUntil.getTime() > now);
}

function retryAfterSeconds(rows: BlockRow[]): number | null {
  let max = 0;
  for (const row of rows) {
    if (row.permanent) continue;
    if (row.lockedUntil) {
      const seconds = Math.max(1, Math.ceil((row.lockedUntil.getTime() - Date.now()) / 1000));
      if (seconds > max) max = seconds;
    }
  }
  return max > 0 ? max : null;
}

async function applyLockout(
  kind: FingerprintKind,
  value: string,
  failCount: number,
  capMs?: number
): Promise<void> {
  let duration = lockoutDuration(failCount);
  let permanent = false;

  if (duration === null) {
    if (capMs) {
      permanent = false;
      duration = capMs;
    } else {
      permanent = true;
    }
  } else if (capMs) {
    duration = Math.min(duration, capMs);
  }

  const finalDuration = duration ?? 0;
  const lockedUntil = permanent ? null : finalDuration > 0 ? new Date(Date.now() + finalDuration) : null;

  await prisma.authBan.upsert({
    where: { kind_value: { kind, value } },
    update: { failCount, permanent, lockedUntil },
    create: { kind, value, failCount, permanent, lockedUntil },
  });
}

export async function recordFailure(
  fingerprint: Fingerprint,
  account?: { id: string; trustedIp: boolean } | null
): Promise<void> {
  const [ipCount, cookieCount, uaCount] = await Promise.all([
    prisma.authBan.findUnique({ where: { kind_value: { kind: "IP", value: fingerprint.ip } } }),
    prisma.authBan.findUnique({ where: { kind_value: { kind: "COOKIE", value: fingerprint.cookie } } }),
    prisma.authBan.findUnique({ where: { kind_value: { kind: "UA", value: fingerprint.userAgent } } }),
  ]);

  await applyLockout("IP", fingerprint.ip, (ipCount?.failCount ?? 0) + 1);
  await applyLockout("COOKIE", fingerprint.cookie, (cookieCount?.failCount ?? 0) + 1);
  await applyLockout("UA", fingerprint.userAgent, (uaCount?.failCount ?? 0) + 1);

  if (account) {
    const existing = await prisma.authBan.findUnique({
      where: { kind_value: { kind: "ACCOUNT", value: account.id } },
    });
    const failCount = (existing?.failCount ?? 0) + 1;
    await applyLockout("ACCOUNT", account.id, failCount, account.trustedIp ? TRUSTED_IP_MAX_LOCKOUT_MS : undefined);
  }
}

export async function recordSuccess(fingerprint: Fingerprint, accountId?: string | null): Promise<void> {
  await prisma.authBan.updateMany({
    where: { kind: { in: ["IP", "COOKIE", "UA"] }, value: { in: [fingerprint.ip, fingerprint.cookie, fingerprint.userAgent] } },
    data: { failCount: 0, permanent: false, lockedUntil: null },
  });

  if (accountId) {
    await prisma.authBan.updateMany({
      where: { kind: "ACCOUNT", value: accountId },
      data: { failCount: 0, permanent: false, lockedUntil: null },
    });
    await prisma.user.update({
      where: { id: accountId },
      data: { lastLoginIp: fingerprint.ip },
    });
  }
}

export async function fingerprintBlock(fingerprint: Fingerprint): Promise<BlockResult | null> {
  const rows = await prisma.authBan.findMany({
    where: {
      OR: [
        { kind: "IP", value: fingerprint.ip },
        { kind: "COOKIE", value: fingerprint.cookie },
        { kind: "UA", value: fingerprint.userAgent },
      ],
    },
  });

  const blocked = rows.filter((row) => isBlocked(row));
  if (blocked.length < 2) return null;

  return {
    permanent: blocked.some((row) => row.permanent),
    retryAfterSeconds: retryAfterSeconds(blocked),
  };
}

export async function accountBlock(accountId: string): Promise<BlockResult | null> {
  const row = await prisma.authBan.findUnique({
    where: { kind_value: { kind: "ACCOUNT", value: accountId } },
  });

  if (!row || !isBlocked(row)) return null;

  return {
    permanent: row.permanent,
    retryAfterSeconds: row.permanent ? null : row.lockedUntil ? Math.max(1, Math.ceil((row.lockedUntil.getTime() - Date.now()) / 1000)) : null,
  };
}

async function findUserByIdentifier(identifier: string) {
  const lower = identifier.toLowerCase();
  return prisma.user.findFirst({
    where: { OR: [{ email: lower }, { username: lower }] },
  });
}

function userFromTwoFactorToken(token: string): { id: string } | null {
  try {
    const payload = jwt.verify(token, getEnv().JWT_SECRET) as { userId: string; purpose?: string };
    if (payload.purpose !== "twofactor") return null;
    return { id: payload.userId };
  } catch {
    return null;
  }
}

export async function resolveAuthAccount(
  path: string,
  body: Record<string, unknown> | undefined,
  ip: string
): Promise<{ id: string; trustedIp: boolean } | null> {
  let user: { id: string; registeredIp: string | null; lastLoginIp: string | null } | null = null;

  if (path.startsWith("/2fa")) {
    const token = typeof body?.token === "string" ? body.token : "";
    const account = userFromTwoFactorToken(token);
    if (account) {
      user = await prisma.user.findUnique({
        where: { id: account.id },
        select: { id: true, registeredIp: true, lastLoginIp: true },
      });
    }
  } else if (typeof body?.identifier === "string") {
    user = await findUserByIdentifier(body.identifier);
  }

  if (!user) return null;

  return {
    id: user.id,
    trustedIp: user.registeredIp === ip || user.lastLoginIp === ip,
  };
}
