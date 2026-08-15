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

  const data = body?.data as { token?: string; requiresTwoFactor?: boolean } | undefined;
  const success = Boolean(data?.token) || data?.requiresTwoFactor === true;
  const account = res.locals.authAccount as AuthAccount | null | undefined;

  if (success) {
    await recordSuccess(fingerprint, account?.id ?? null);
  } else if (status >= 400 && status < 500 && (req.path !== "/register" || res.locals.countAuthFailure === true)) {
    const penalties = await recordFailure(fingerprint, account ?? null);
    await logAuthFailure({
      fingerprint,
      username: account?.username ?? null,
      accountId: account?.id ?? null,
      reason: reasonFor(req.path, status, res.locals.authFailureReason),
      penalty: pickWorstPenalty(penalties),
    });
  }
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
          void recordOutcome(req, res, res.statusCode, body as { data?: unknown }).catch(() => {});
          return originalJson(body);
        };
      }

      next();
    } catch {
      next();
    }
  })();
}
