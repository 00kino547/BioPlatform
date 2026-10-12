import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { getEnv } from "../config/env.js";
import { prisma } from "../lib/prisma.js";
import { requireCurrentConsent } from "./consent.js";
import { dmcaAppealUrl } from "../lib/dmca.js";

export interface AuthPayload {
  userId: string;
  purpose?: "auth" | "twofactor" | "unlock";
  /** authVersion embedded at issue time (A4). Absent on tokens issued before the feature → treated as 0. */
  av?: number;
}

declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

/**
 * Authenticated paths a copyright-disabled account keeps access to.
 *
 * Everything else returns 423. These are FULL paths (`baseUrl` + `path`), for
 * the same reason consent.ts spells that out: matching on `req.path` alone
 * would match `/me` on six different routers and hand a disabled account every
 * one of them.
 *
 * The list is deliberately narrow — an escape hatch, not a second session:
 *
 *   - `/api/auth/me`          so the SPA can learn it is disabled and render the
 *                             appeal screen instead of a generic error.
 *   - `/api/auth/accept-policies`
 *                             without this the account loops: the policy bump
 *                             that shipped with this feature makes it consent-
 *                             outdated, the SPA shows the consent gate, and the
 *                             accept call would bounce off this gate with 423.
 *   - `/api/auth/passkeys*`, `/totp/*`, `/change-password`
 *                             the account holder must still be able to secure
 *                             their own credentials while the claim is reviewed.
 *   - `/api/dmca/status`, `/api/dmca/appeal`
 *                             the appeal itself. Blocking these would make the
 *                             423 a dead end with no way out.
 *
 * Profile edits, uploads, shop, music, analytics, admin: 423.
 */
const DISABLED_EXEMPT_PATHS: ReadonlySet<string> = new Set([
  "/api/auth/me",
  "/api/auth/accept-policies",
  "/api/auth/totp/setup",
  "/api/auth/totp/enable",
  "/api/auth/totp/disable",
  "/api/auth/change-password",
  "/api/dmca/status",
  "/api/dmca/appeal",
]);

/**
 * Prefixes exempt because one of them carries a path parameter
 * (`DELETE /api/auth/passkeys/:id`), which an exact-match set cannot express.
 * Only passkeys live under this prefix, and the boundary check keeps
 * `/api/auth/passkeysomething` from sliding through.
 */
const DISABLED_EXEMPT_PREFIXES: readonly string[] = ["/api/auth/passkeys"];

/** True when this request path survives the disabled-account gate. */
function isDisabledExempt(req: Request): boolean {
  const path = `${req.baseUrl}${req.path}`;
  if (DISABLED_EXEMPT_PATHS.has(path)) return true;
  return DISABLED_EXEMPT_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

/**
 * Authenticates the bearer token and verifies the user still exists with the
 * same credential version. The user is loaded from the DB on every request so
 * a password change / admin reset (which bump `authVersion`) immediately
 * invalidates every previously issued session token for that user (A4).
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;

  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ success: false, error: "Missing token" });
  }

  const token = header.slice(7);

  try {
    const payload = jwt.verify(token, getEnv().JWT_SECRET) as AuthPayload;
    if (payload.purpose !== "auth") {
      return res.status(401).json({ success: false, error: "Invalid token" });
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, authVersion: true, disabledAt: true, disabledReason: true },
    });
    if (!user) {
      return res.status(401).json({ success: false, error: "Invalid token" });
    }

    // Compare the credential version stamped into the token against the user's
    // current value. Legacy tokens carry no `av` claim → treat as version 0,
    // which matches every user who never had their credentials bumped.
    const tokenVersion = payload.av ?? 0;
    if (tokenVersion !== user.authVersion) {
      return res.status(401).json({
        success: false,
        error: "Session expired — you signed in with a different set of credentials",
      });
    }

    req.userId = user.id;

    // Copyright-takedown lock. Runs BEFORE the consent gate on purpose: a
    // disabled account is normally also consent-outdated (the policy bump ships
    // with this feature), and a `policies_outdated` 403 would mask the one code
    // the SPA needs to route the user to the appeal screen. 423 + the reason is
    // the more specific state, so it is reported first.
    if (user.disabledAt && !isDisabledExempt(req)) {
      return res.status(423).json({
        success: false,
        code: "account_disabled",
        error: "This account is disabled pending a copyright review.",
        appealUrl: dmcaAppealUrl(),
        disabledAt: user.disabledAt,
        disabledReason: user.disabledReason ?? "dmca",
      });
    }

    // Deemed-acceptance gate: an account that has not accepted the current
    // Terms of Service / Privacy Policy cannot use the platform. Runs here so
    // every authenticated route inherits it; the consent endpoints themselves
    // are exempt inside the middleware.
    return requireCurrentConsent(req, res, next);
  } catch {
    return res.status(401).json({ success: false, error: "Invalid token" });
  }
}
