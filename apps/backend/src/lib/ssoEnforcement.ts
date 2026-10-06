import type { Response } from "express";
import { prisma } from "./prisma.js";

export const SSO_FORCED_ERROR = "This account requires sign-in via enterprise SSO";

/**
 * Check whether an account has enterprise-SSO enforcement enabled (`enforced`).
 *
 * Enforcement means: the account may only obtain a session through the
 * configured enterprise SSO provider — every other authentication path
 * (password, passkey/passkey-2FA, OAuth link) must be refused for that user.
 * This function is the single source of truth for the "is this account SSO
 * forced?" question and is deliberately free of response-writing side effects
 * so it stays safe to call in read-only / non-login contexts.
 */
export async function isAccountSsoForced(userId: string): Promise<boolean> {
  const config = await prisma.enterpriseSso.findUnique({
    where: { userId },
    select: { enforced: true },
  });
  return config?.enforced === true;
}

/**
 * Traffic-light for login paths: returns `false` once it has already written a
 * 403 "SSO forced" response for the user (caller must stop and `return`), or
 * `true` when the login may proceed.
 *
 * Every login-granting branch (password login, passkey login, passkey 2FA,
 * OAuth re-link, enterprise-exchange of a previously-linked account) funnels
 * through this check so an enforced account can *never* obtain a session
 * through a non-SSO path — including one that was already linked before
 * enforcement was enabled.
 */
export async function ssoForceBlocksLogin(
  res: Response,
  userId: string
): Promise<boolean> {
  if (await isAccountSsoForced(userId)) {
    res.status(403).json({ success: false, error: SSO_FORCED_ERROR });
    return false;
  }
  return true;
}