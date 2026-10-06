import { getCacheDriver } from "./cache.js";

/**
 * Cache key and invalidation for the public policy context.
 *
 * The legal pages read one cached snapshot so a page load does not query the
 * database for every provider. Its lifetime is in `routes/policy.ts`; this module
 * owns the key so a *write* to any of the underlying settings can invalidate it.
 */
export const POLICY_CONTEXT_CACHE_KEY = "policy:public-context";

/**
 * Drops the cached snapshot.
 *
 * Called whenever an operator changes something the legal text describes — the
 * resale mode, the store switch, generation — so the published document stops
 * claiming the old thing instead of lagging behind by up to a minute. A stale
 * legal page is worse than a slightly slower save.
 */
export async function clearPolicyContextCache(): Promise<void> {
  await getCacheDriver().del(POLICY_CONTEXT_CACHE_KEY);
}