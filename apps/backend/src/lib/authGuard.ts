import { randomUUID, createHash } from "crypto";
import type { Request, Response } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "./prisma.js";
import { getEnv } from "../config/env.js";

export const AUTH_COOKIE = "bio_sid";

export const MAX_FREE_ATTEMPTS = 3;
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
  failCount: number;
}

export interface PenaltyInfo {
  permanent: boolean;
  penaltyMinutes: number | null;
  expiresAt: Date | null;
  failCount: number;
}

export interface AuthAccount {
  id: string;
  username: string | null;
  trustedIp: boolean;
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

function lockDurationMs(): number | null {
  const minutes = getEnv().AUTH_LOCK_DURATION_MINUTES;
  if (minutes <= 0) return null;
  return minutes * 60 * 1000;
}

interface BlockRow {
  failCount: number;
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
  failCount: number
): Promise<PenaltyInfo> {
  let permanent = false;
  let lockedUntil: Date | null = null;

  if (failCount > MAX_FREE_ATTEMPTS) {
    const durationMs = lockDurationMs();
    if (durationMs === null) {
      permanent = true;
    } else {
      lockedUntil = new Date(Date.now() + durationMs);
    }
  }

  await prisma.authBan.upsert({
    where: { kind_value: { kind, value } },
    update: { failCount, permanent, lockedUntil },
    create: { kind, value, failCount, permanent, lockedUntil },
  });

  const locked = failCount > MAX_FREE_ATTEMPTS;
  return {
    permanent,
    penaltyMinutes: locked && !permanent ? getEnv().AUTH_LOCK_DURATION_MINUTES : null,
    expiresAt: lockedUntil,
    failCount,
  };
}

export async function recordFailure(
  fingerprint: Fingerprint,
  account?: AuthAccount | null
): Promise<PenaltyInfo[]> {
  const [ipCount, cookieCount, uaCount] = await Promise.all([
    prisma.authBan.findUnique({ where: { kind_value: { kind: "IP", value: fingerprint.ip } } }),
    prisma.authBan.findUnique({ where: { kind_value: { kind: "COOKIE", value: fingerprint.cookie } } }),
    prisma.authBan.findUnique({ where: { kind_value: { kind: "UA", value: fingerprint.userAgent } } }),
  ]);

  const penalties: PenaltyInfo[] = [];
  penalties.push(await applyLockout("IP", fingerprint.ip, (ipCount?.failCount ?? 0) + 1));
  penalties.push(await applyLockout("COOKIE", fingerprint.cookie, (cookieCount?.failCount ?? 0) + 1));
  penalties.push(await applyLockout("UA", fingerprint.userAgent, (uaCount?.failCount ?? 0) + 1));

  if (account) {
    const existing = await prisma.authBan.findUnique({
      where: { kind_value: { kind: "ACCOUNT", value: account.id } },
    });
    penalties.push(await applyLockout("ACCOUNT", account.id, (existing?.failCount ?? 0) + 1));
  }

  return penalties;
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
    await prisma.authLog.deleteMany({
      where: { accountId, kind: "login_failed" },
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
  if (blocked.length === 0) return null;

  return {
    permanent: blocked.some((row) => row.permanent),
    retryAfterSeconds: retryAfterSeconds(blocked),
    failCount: Math.max(...rows.map((row) => row.failCount), 0),
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
    failCount: row.failCount,
  };
}

export async function logAuthFailure(input: {
  fingerprint: Fingerprint;
  username: string | null;
  accountId: string | null;
  reason: string;
  penalty?: PenaltyInfo | null;
}): Promise<void> {
  await prisma.authLog.create({
    data: {
      kind: "login_failed",
      username: input.username,
      accountId: input.accountId,
      ip: input.fingerprint.ip,
      userAgentHash: sha256(input.fingerprint.userAgent),
      fingerprint: input.fingerprint.cookie,
      reason: input.reason,
      penaltyMinutes: input.penalty?.penaltyMinutes ?? null,
      permanent: input.penalty?.permanent ?? false,
      triggeredBy: input.penalty && input.penalty.failCount > MAX_FREE_ATTEMPTS ? `${input.penalty.failCount} failed attempts` : null,
      expiresAt: input.penalty?.expiresAt ?? null,
    },
  });
}

async function findUserByIdentifier(identifier: string) {
  const lower = identifier.toLowerCase();
  return prisma.user.findFirst({
    where: { OR: [{ email: lower }, { username: lower }] },
    select: { id: true, username: true, email: true, registeredIp: true, lastLoginIp: true },
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
): Promise<AuthAccount | null> {
  let user: { id: string; username: string; registeredIp: string | null; lastLoginIp: string | null } | null = null;

  if (path.startsWith("/2fa")) {
    const token = typeof body?.token === "string" ? body.token : "";
    const account = userFromTwoFactorToken(token);
    if (account) {
      user = await prisma.user.findUnique({
        where: { id: account.id },
        select: { id: true, username: true, registeredIp: true, lastLoginIp: true },
      });
    }
  } else if (typeof body?.identifier === "string") {
    user = await findUserByIdentifier(body.identifier);
  }

  if (!user) return null;

  return {
    id: user.id,
    username: user.username,
    trustedIp: user.registeredIp === ip || user.lastLoginIp === ip,
  };
}

export function penaltyFromBlock(block: BlockResult): PenaltyInfo {
  return {
    permanent: block.permanent,
    penaltyMinutes: block.permanent ? null : block.retryAfterSeconds ? Math.ceil(block.retryAfterSeconds / 60) : null,
    expiresAt: block.permanent ? null : new Date(Date.now() + (block.retryAfterSeconds ?? 0) * 1000),
    failCount: block.failCount,
  };
}

export function pickWorstPenalty(penalties: PenaltyInfo[]): PenaltyInfo | null {
  const locked = penalties.filter((p) => p.permanent || p.penaltyMinutes !== null);
  if (locked.length === 0) return null;
  const permanent = locked.some((p) => p.permanent);
  const last = locked[locked.length - 1];
  return { permanent, penaltyMinutes: last.penaltyMinutes, expiresAt: last.expiresAt, failCount: last.failCount };
}
