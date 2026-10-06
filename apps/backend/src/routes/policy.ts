// Public, unauthenticated endpoint that tells the Terms of Service and Privacy
// Policy pages which data-processing features this instance actually has on, so
// the legal text can describe reality instead of hedging with "may optionally".
//
// The payload contains booleans and provider labels only — see
// lib/policyContext.ts for the field-by-field security note.

import { Router, type Request, type Response } from "express";
import { getCacheDriver } from "../lib/cache.js";
import { buildPolicyContext, type PolicyContext } from "../lib/policyContext.js";
import { getInviteGenerationEnabled, getInvitePurchaseEnabled, getInviteResalePolicy } from "../lib/inviteService.js";
import { invitePackConfig } from "../lib/invitePricing.js";
import type { InviteResaleMode } from "../lib/inviteService.js";
import { POLICY_CONTEXT_CACHE_KEY, clearPolicyContextCache } from "../lib/policyContextCache.js";

const router = Router();

const CACHE_KEY = POLICY_CONTEXT_CACHE_KEY;
const CACHE_TTL_MS = 60_000;

/**
 * The policy payload served to the legal pages.
 *
 * Extends the pure, env-derived context rather than folding the database facts
 * into it: `buildPolicyContext` is synchronous and testable without a database, so
 * the two operator decisions stored in settings (generation, purchasing) and the
 * three-valued resale mode are awaited here and attached on top.
 */
export interface PolicyContextResponse extends PolicyContext {
  invites: {
    /** Members may turn their allowance into codes. */
    generationEnabled: boolean;
    /**
     * A store is live only when the operator enabled it *and* priced it, so an
     * enabled flag with no `INVITE_PRICE_PACKS` never reads as "you can buy here".
     */
    purchaseEnabled: boolean;
    /**
     * `off` means the terms stay silent on resale. `permitted` adds an explicit
     * permission. `legal` adds an explicit prohibition. `enforced` adds the
     * prohibition and marks purchased codes as tracked, so the platform can
     * answer where a given code came from.
     */
    resaleMode: InviteResaleMode;
    /** Convenience for the legal text: whether a resale prohibition is published. */
    resaleRestricted: boolean;
    /** Convenience for the legal text: whether a resale permission is published. */
    resalePermitted: boolean;
  };
}

async function buildPolicyContextWithInvites(): Promise<PolicyContextResponse> {
  const base = buildPolicyContext();
  const [generationEnabled, purchaseEnabled, resale] = await Promise.all([
    getInviteGenerationEnabled(),
    getInvitePurchaseEnabled(),
    getInviteResalePolicy(),
  ]);
  const { packs } = invitePackConfig();

  return {
    ...base,
    invites: {
      generationEnabled,
      purchaseEnabled: purchaseEnabled && packs.length > 0,
      resaleMode: resale.mode,
      // Both flags come from the shared policy helper rather than being derived
      // from the mode here, so the legal pages can never publish a clause that
      // disagrees with what the platform actually does.
      resaleRestricted: resale.clause === "prohibited",
      resalePermitted: resale.clause === "permitted",
    },
  };
}

router.get("/context", async (_req: Request, res: Response) => {
  try {
    const cache = getCacheDriver();
    const cached = await cache.get(CACHE_KEY);
    if (cached) {
      res.setHeader("Cache-Control", "public, max-age=60");
      return res.json({ success: true, data: JSON.parse(cached) as PolicyContextResponse });
    }
    const context = await buildPolicyContextWithInvites();
    await cache.set(CACHE_KEY, JSON.stringify(context), CACHE_TTL_MS);
    res.setHeader("Cache-Control", "public, max-age=60");
    res.json({ success: true, data: context });
  } catch {
    // The policy pages fall back to their neutral wording if this fails, so a
    // cache outage must not take the legal pages down with it.
    res.setHeader("Cache-Control", "no-store");
    res.status(503).json({ success: false, error: "Policy context unavailable" });
  }
});

/**
 * Exported so admin routes can invalidate the snapshot after a write, and so
 * tests can read a freshly built context instead of the previous one.
 */
export { clearPolicyContextCache };

export default router;