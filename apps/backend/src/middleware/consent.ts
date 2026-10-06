// Deemed-acceptance gate for the Terms of Service and Privacy Policy.
//
// The policy versions live in `POLICY_VERSIONS` (lib/newsletter.ts). A user is
// "current" on consent when either:
//
//   1. they explicitly accepted the current versions
//      (`acceptedTosVersion` / `acceptedPrivacyVersion` match), or
//   2. they are DEEMED to have accepted them because they kept using the
//      platform: `lastLoginAt` is at or after the effective date + 30 days.
//      Continued use is proven by the most recent login, so an account that
//      nobody has logged into since the new version shipped is NOT deemed.
//
// `consentCurrent()` implemented this rule but nothing ever called it, so
// bumping POLICY_VERSIONS did not stop anybody: existing users carried on using
// the platform indefinitely on the old wording. This middleware is what makes
// the rule real — it runs after `requireAuth` and refuses the request until the
// account accepts the current policies.
//
// The response uses a machine-readable `code` so the SPA can recognise it and
// route the user to the acceptance screen instead of showing a generic error.

import { Request, Response, NextFunction } from "express";
import { prisma } from "../lib/prisma.js";
import { POLICY_VERSIONS, consentCurrent, deemedAcceptanceCutoff, policyEffectiveDate } from "../lib/newsletter.js";
import { getEnv } from "../config/env.js";

/**
 * Paths that must stay reachable while an account is out of date, otherwise the
 * user could never fix it.
 *
 * These are FULL paths, not router-relative ones. That distinction is a
 * security boundary, not a style choice: six routers define a `/me` route
 * (`/api/auth`, `/api/profiles`, `/api/orders`, `/api/affiliate`,
 * `/api/analytics`, `/api/music`). Matching on `req.path` alone would exempt
 * all six, letting an out-of-date account edit its profile, read orders and
 * pull analytics — the exact access the gate exists to withhold. `req.baseUrl`
 * is the mount prefix and `req.path` the remainder, so the pair is unique.
 *
 * Only two routes need this. Sign-out is client-side only (the SPA drops its
 * token), and `/unlock`, `/2fa/*`, `/passkeys/*` are unauthenticated, so they
 * never reach `requireAuth` in the first place.
 */
const CONSENT_EXEMPT_PATHS: ReadonlySet<string> = new Set([
  // The client calls this to learn whether it must show the gate.
  "/api/auth/me",
  // The endpoint that records acceptance.
  "/api/auth/accept-policies",
]);

/**
 * True when the full request path is exempt. Exact match only, so a longer path
 * such as `/api/profiles/me` or `/api/auth/accept-policies/extra` is still
 * gated.
 */
function isExempt(req: Request): boolean {
  return CONSENT_EXEMPT_PATHS.has(`${req.baseUrl}${req.path}`);
}

export interface ConsentState {
  /** False when the account must accept the current policies before proceeding. */
  current: boolean;
  /** Which of the two documents the account is behind on. */
  behind: { tos: boolean; privacy: boolean };
  /**
   * True when the account is current only because the operator auto-accept rule
   * recorded it, not because a person clicked accept. Reported so the UI can say
   * so honestly instead of implying consent the user never gave.
   */
  autoAccepted: boolean;
}

/**
 * Role slugs that count as operator accounts for the auto-accept rule.
 *
 * Read from the environment rather than hardcoded so an instance can add its own
 * staff roles (`support`, `moderator`, …) deliberately. Unknown slugs are simply
 * never matched — naming a role that does not exist grants nothing, which is the
 * safe direction for a permission-shaped setting.
 */
function autoAcceptRoleSlugs(): Set<string> {
  return new Set(
    getEnv()
      .POLICY_ADMIN_AUTO_ACCEPT_ROLES.split(",")
      .map((slug) => slug.trim().toLowerCase())
      .filter(Boolean),
  );
}

/** True when this account's role is covered by POLICY_ADMIN_AUTO_ACCEPT. */
function isAutoAcceptRole(roleSlug: string | null | undefined): boolean {
  const env = getEnv();
  if (!env.POLICY_ADMIN_AUTO_ACCEPT || !roleSlug) return false;
  return autoAcceptRoleSlugs().has(roleSlug.toLowerCase());
}

/**
 * True once the review window everyone else gets has elapsed for the current
 * policy versions. Automatic acceptance is deemed acceptance, so it waits out the
 * same DEEMED_ACCEPTANCE_DAYS rather than recording consent the moment a policy
 * is published.
 */
function autoAcceptWindowOpen(now: Date): boolean {
  return now >= deemedAcceptanceCutoff(policyEffectiveDate());
}

/**
 * Reads the account's consent state. Shared with the `/me` endpoint and the
 * admin policy-status endpoint so all three agree on the answer.
 *
 * The operator auto-accept is applied HERE, in the one place every consumer of
 * consent state already calls, rather than in a middleware of its own. That is
 * what keeps `/me`, the gate and the admin view from ever disagreeing about
 * whether somebody is locked out.
 */
export async function readConsentState(userId: string, now: Date = new Date()): Promise<ConsentState> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      acceptedTosVersion: true,
      acceptedPrivacyVersion: true,
      lastLoginAt: true,
      policiesAutoAccepted: true,
      role: { select: { slug: true } },
    },
  });

  // No user row means the token is already invalid; report "current" so this
  // helper never becomes the thing that produces a confusing 403.
  if (!user) return { current: true, behind: { tos: false, privacy: false }, autoAccepted: false };

  const behind = {
    tos: user.acceptedTosVersion !== POLICY_VERSIONS.tos,
    privacy: user.acceptedPrivacyVersion !== POLICY_VERSIONS.privacy,
  };

  // Already recorded (whether clicked or auto) — nothing to do.
  if (!behind.tos && !behind.privacy) {
    return { current: true, behind, autoAccepted: user.policiesAutoAccepted };
  }

  if (isAutoAcceptRole(user.role.slug) && autoAcceptWindowOpen(now)) {
    // Record it for real. This is a write to the user's own row, so the acceptance
    // is auditable: which versions, when, and the fact that it was automatic.
    const stamped = await prisma.user.update({
      where: { id: userId },
      data: {
        acceptedTosVersion: POLICY_VERSIONS.tos,
        acceptedPrivacyVersion: POLICY_VERSIONS.privacy,
        acceptedPoliciesAt: now,
        policiesAutoAccepted: true,
      },
      select: { acceptedTosVersion: true, acceptedPrivacyVersion: true, policiesAutoAccepted: true },
    });
    return {
      current: stamped.acceptedTosVersion === POLICY_VERSIONS.tos && stamped.acceptedPrivacyVersion === POLICY_VERSIONS.privacy,
      behind: { tos: false, privacy: false },
      autoAccepted: stamped.policiesAutoAccepted,
    };
  }

  return { current: consentCurrent(user), behind, autoAccepted: user.policiesAutoAccepted };
}

/**
 * Blocks an authenticated request until the account has accepted the current
 * policy versions.
 *
 * Called from `requireAuth` right after `req.userId` is set, so every
 * authenticated route in the app is covered by one edit instead of threading a
 * middleware through every router.
 */
export async function requireCurrentConsent(req: Request, res: Response, next: NextFunction) {
  if (!req.userId) return next();
  if (isExempt(req)) return next();

  const state = await readConsentState(req.userId);
  if (state.current) return next();

  return res.status(403).json({
    success: false,
    code: "policies_outdated",
    error: "You must accept the current Terms of Service and Privacy Policy before continuing.",
    behind: state.behind,
    autoAccepted: state.autoAccepted,
    policyVersions: POLICY_VERSIONS,
  });
}
