import type { PocketBaseClient, SuperuserKind } from "./client.js";
import { createCollection, getCollection } from "./client.js";

// Idempotent collection bootstrap for the analytics module. Runs at backend
// startup (gated by POCKETBASE_BOOTSTRAP) so the operator never touches the
// PocketBase admin UI to get analytics working. Creating an already-existing
// collection is a no-op; the write is fire-and-forget for the loader.
//
// Both analytics collections are public-INSERT only (`createRule: ""`):
//   - the browser-side loader posts pageview/link-click records without auth,
//   - but the records themselves are never readable (rules stay null) so no
//     visitor data leaks through the public API.

export const POCKETBASE_COLLECTIONS = {
  pageviews: "analytics_pageviews",
  linkclicks: "analytics_linkclicks",
} as const;

export interface BootstrapResult {
  collections: Array<{ name: string; created: boolean }>;
  /** True when the instance uses the legacy v0.22 admin API. */
  legacy: boolean;
}

/**
 * Ensure the analytics collections exist. Returns which were created and
 * whether this instance runs the legacy v0.22 admin API.
 */
export async function bootstrapPocketbaseCollections(
  client: PocketBaseClient
): Promise<BootstrapResult> {
  const { config } = client;
  if (!config.enabled) return { collections: [], legacy: false };

  // Fail soft across the ENTIRE flow (auth included) — analytics must degrade
  // gracefully if PB is unreachable or misconfigured. The backend keeps serving.
  try {
    const { token, kind } = await client.superuserToken();
    const legacy = kind === "Admin";

    const pageviews = await upsertCollection(
      client,
      POCKETBASE_COLLECTIONS.pageviews,
      ["profileSlug", "visitorId", "url", "referrer", "userAgent"],
      token,
      kind,
      legacy
    );
    const linkclicks = await upsertCollection(
      client,
      POCKETBASE_COLLECTIONS.linkclicks,
      ["profileSlug", "visitorId", "platform", "url", "label"],
      token,
      kind,
      legacy
    );

    return {
      collections: [
        { name: POCKETBASE_COLLECTIONS.pageviews, created: pageviews },
        { name: POCKETBASE_COLLECTIONS.linkclicks, created: linkclicks },
      ],
      legacy,
    };
  } catch {
    return { collections: [], legacy: false };
  }
}

async function upsertCollection(
  client: PocketBaseClient,
  name: string,
  fields: string[],
  token: string,
  kind: SuperuserKind,
  legacy: boolean
): Promise<boolean> {
  const { config } = client;
  try {
    const existing = await getCollection(config, name, token, kind);
    if (existing) return false;
    await createCollection(
      config,
      { name, fields, createRule: "", listRule: null, viewRule: null },
      token,
      kind,
      legacy
    );
    return true;
  } catch {
    // Fail soft — analytics degrades gracefully if PB is unreachable or
    // misconfigured; the backend must keep serving regardless.
    return false;
  }
}