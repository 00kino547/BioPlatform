import type { NextFunction, Request, Response } from "express";
import {
  fingerprintFromRequest,
  fingerprintBlock,
  accountBlock,
  recordFailure,
  recordSuccess,
  resolveAuthAccount,
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

interface ResolvedAccount {
  id: string;
  trustedIp: boolean;
}

function sendBlock(res: Response, block: { permanent: boolean; retryAfterSeconds: number | null }) {
  if (block.permanent) {
    return res.status(403).json({ success: false, error: PERMANENT_MESSAGE });
  }
  res.setHeader("Retry-After", String(block.retryAfterSeconds ?? 60));
  return res.status(429).json({ success: false, error: BLOCKED_MESSAGE });
}

async function resolveAccount(req: Request): Promise<ResolvedAccount | null> {
  if (!ACCOUNT_PATHS.has(req.path)) return null;
  const fingerprint = req.authFingerprint;
  if (!fingerprint) return null;
  return resolveAuthAccount(req.path, req.body ?? {}, fingerprint.ip);
}

function recordOutcome(req: Request, res: Response, status: number, body: { data?: unknown } | null | undefined) {
  const fingerprint = req.authFingerprint;
  if (!fingerprint) return;

  const data = body?.data as { token?: string; requiresTwoFactor?: boolean } | undefined;
  const success = Boolean(data?.token) || data?.requiresTwoFactor === true;
  const account = res.locals.authAccount as ResolvedAccount | null | undefined;

  if (success) {
    void recordSuccess(fingerprint, account?.id ?? null).catch(() => {});
  } else if (status >= 400 && status < 500) {
    void recordFailure(fingerprint, account ?? null).catch(() => {});
  }
}

export function authRateLimit(req: Request, res: Response, next: NextFunction) {
  void (async () => {
    try {
      req.authFingerprint = fingerprintFromRequest(req, res);

      if (req.method === "POST" && PROTECTED_PATHS.has(req.path)) {
        const block = await fingerprintBlock(req.authFingerprint);
        if (block) {
          sendBlock(res, block);
          return;
        }

        const account = await resolveAccount(req);
        if (account) {
          res.locals.authAccount = account;
          const accBlock = await accountBlock(account.id);
          if (accBlock) {
            sendBlock(res, accBlock);
            return;
          }
        }

        const originalJson = res.json.bind(res);
        res.json = (body) => {
          recordOutcome(req, res, res.statusCode, body as { data?: unknown });
          return originalJson(body);
        };
      }

      next();
    } catch {
      next();
    }
  })();
}
