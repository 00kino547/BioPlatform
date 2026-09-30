import type { NextFunction, Request, Response } from "express";
import { getEnv } from "../config/env.js";
import { isEmailEnabled } from "../lib/email.js";
import {
  fingerprintFromRequest,
  fingerprintBlock,
  accountBlock,
  recordFailure,
  recordSuccess,
  resolveAuthAccount,
  logAuthFailure,
  penaltyFromBlock,
  pickWorstPenalty,
  type AuthAccount,
} from "../lib/authGuard.js";
import { isIpAbuseWhitelisted } from "../lib/antiAbuseWhitelist.js";

const PROTECTED_PATHS = new Set([
  "/login",
  "/login/passkey/options",
  "/login/passkey/verify",
  "/2fa/totp",
  "/2fa/passkey/options",
  "/2fa/passkey/verify",
  "/change-password",
  "/register",
  "/unlock",
]);

const ACCOUNT_PATHS = new Set([
  "/login",
  "/login/passkey/options",
  "/login/passkey/verify",
  "/2fa/totp",
  "/2fa/passkey/options",
  "/2fa/passkey/verify",
]);

const BLOCKED_MESSAGE = "Too many failed attempts. Please try again later.";
const PERMANENT_MESSAGE = "Too many failed attempts. Access has been blocked.";
const EMAIL_UNLOCK_MESSAGE = "Too many failed attempts. Your account is locked — check your email to unlock it.";
const REG_PROBE_WINDOW_MS = 60_000;
const REG_PROBE_MAX = 10;
const regProbes = new Map<string, number[]>();

function checkRegProbe(ip: string): boolean {
  const now = Date.now();
  const timestamps = regProbes.get(ip) ?? [];
  const recent = timestamps.filter((t) => now - t < REG_PROBE_WINDOW_MS);
  if (recent.length >= REG_PROBE_MAX) return false;
  return true;
}

export function recordRegProbe(ip: string): void {
  const now = Date.now();
  const timestamps = regProbes.get(ip) ?? [];
  const recent = timestamps.filter((t) => now - t < REG_PROBE_WINDOW_MS);
  recent.push(now);
  regProbes.set(ip, recent);
}

export function isRegistrationProbeAllowed(ip: string): boolean {
  return checkRegProbe(ip);
}

function sendBlock(res: Response, block: { permanent: boolean; retryAfterSeconds: number | null }) {
  if (block.permanent) {
    return res.status(403).json({ success: false, error: PERMANENT_MESSAGE });
  }
  res.setHeader("Retry-After", String(block.retryAfterSeconds ?? 60));
  return res.status(429).json({ success: false, error: BLOCKED_MESSAGE });
}

async function resolveAccount(req: Request): Promise<AuthAccount | null> {
  if (!ACCOUNT_PATHS.has(req.path)) return null;
  const fingerprint = req.authFingerprint;
  if (!fingerprint) return null;
  return resolveAuthAccount(req.path, req.body ?? {}, fingerprint.ip);
}

function reasonFor(path: string, status: number, customReason?: unknown): string {
  if (typeof customReason === "string" && customReason.length > 0) return customReason;
  if (path === "/login") return "Invalid password";
  if (path === "/login/passkey/verify") return "Passkey authentication failed";
  if (path === "/2fa/totp") return "Invalid 2FA code";
  if (path === "/2fa/passkey/verify") return "Invalid passkey";
  if (path === "/change-password") return "Invalid current password";
  return `Authentication failed (${status})`;
}

async function recordOutcome(req: Request, res: Response, status: number, body: { data?: unknown } | null | undefined) {
  const fingerprint = req.authFingerprint;
  if (!fingerprint) return;

  // A3b: the verify-email gate fires only when the password was CORRECT but the
  // account is not verified yet — it is not an authentication failure. Penalizing
  // it would let anyone farm permanent fingerprint/account bans by typing
  // passwords at unverified accounts, and would punish legitimate users who
  // simply verify their inbox later.
  const gateBody = body as { verifyEmailRequired?: boolean } | null | undefined;
  if (gateBody?.verifyEmailRequired === true) return;

  const success = isFullyAuthenticated(body);

  if (success) {
    await recordSuccess(fingerprint, res.locals.authAccount?.id ?? null);
  } else if (status >= 400 && status < 500 && (req.path !== "/register" || res.locals.countAuthFailure === true)) {
    const penalties = await recordFailure(fingerprint, res.locals.authAccount ?? null);
    await logAuthFailure({
      fingerprint,
      username: res.locals.authAccount?.username ?? null,
      accountId: res.locals.authAccount?.id ?? null,
      reason: reasonFor(req.path, status, res.locals.authFailureReason),
      penalty: pickWorstPenalty(penalties),
    });
  } else if (status === 409 && req.path === "/register" && fingerprint) {
    recordRegProbe(fingerprint.ip);
  }
}

// A2: only a response carrying the FINAL auth token counts as a successful
// login. `requiresTwoFactor: true` means the password was correct but the
// session is NOT established yet — it must never clear accumulated lockouts,
// otherwise a permanent ban is trivially wiped by re-typing the password and
// 2FA brute-forcing becomes an infinite loop (fail → correct password →
// bans cleared → fail again).
export function isFullyAuthenticated(body: { data?: unknown } | null | undefined): boolean {
  const data = body?.data as { token?: string } | undefined;
  return typeof data?.token === "string" && data.token.length > 0;
}

async function logBlocked(
  req: Request,
  res: Response,
  reason: string,
  block: { permanent: boolean; retryAfterSeconds: number | null; failCount: number }
) {
  const fingerprint = req.authFingerprint;
  const account = res.locals.authAccount as AuthAccount | null | undefined;
  if (!fingerprint) return;
  await logAuthFailure({
    fingerprint,
    username: account?.username ?? null,
    accountId: account?.id ?? null,
    reason,
    penalty: penaltyFromBlock(block),
  });
}

export function authRateLimit(req: Request, res: Response, next: NextFunction) {
  void (async () => {
    try {
      req.authFingerprint = fingerprintFromRequest(req, res);

      if (req.method === "POST" && req.path === "/register" && req.authFingerprint) {
        const allowlisted = req.authFingerprint.ip
          ? await isIpAbuseWhitelisted(req.authFingerprint.ip)
          : false;
        if (!allowlisted && !checkRegProbe(req.authFingerprint.ip)) {
          res.status(429).json({ success: false, error: "Too many registration attempts. Please try again later." });
          return;
        }
      }

      if (req.method === "POST" && PROTECTED_PATHS.has(req.path)) {
        const account = await resolveAccount(req);
        res.locals.authAccount = account;

        const fpBlock = await fingerprintBlock(req.authFingerprint);
        if (fpBlock) {
          await logBlocked(req, res, "Fingerprint blocked", fpBlock);
          sendBlock(res, fpBlock);
          return;
        }

        if (account) {
          const accBlock = await accountBlock(account.id);
          if (accBlock) {
            const policy = getEnv().AUTH_LOCK_POLICY;
            if (policy === "email" && isEmailEnabled()) {
              await logBlocked(req, res, "Account locked (email unlock required)", accBlock);
              res.status(403).json({ success: false, error: EMAIL_UNLOCK_MESSAGE, unlockRequired: true });
              return;
            }
            await logBlocked(req, res, "Account locked", accBlock);
            sendBlock(res, accBlock);
            return;
          }
        }

        const originalJson = res.json.bind(res);
        res.json = (body) => {
          // Await the failure/success bookkeeping BEFORE the response is sent.
          // recordOutcome persists bans (recordFailure/recordSuccess); returning
          // the response early meant a client could race the issued-ban DB write
          // and slip a follow-up attempt past the freshly-created lockout. This
          // ordering guarantees the accumulated ban is durable before the next
          // request (2FA brute-force escalation test relies on it) and removes a
          // theoretical TOCTOU in production.
          void Promise.resolve(
            recordOutcome(req, res, res.statusCode, body as { data?: unknown } | null | undefined)
          )
            .catch(() => {})
            .then(() => originalJson(body));
          return res;
        };
      }

      next();
    } catch {
      next();
    }
  })();
}
