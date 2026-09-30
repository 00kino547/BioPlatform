import { api } from "@/lib/api";

// Consent-gated PocketBase analytics. The server's /api/analytics/config tells
// us whether the operator enabled PB analytics and which client URL to post to
// (relative /api/pb-speed proxied by nginx, or an external instance). Events
// are only ever sent when the visitor has accepted non-essential cookies AND
// has not requested privacy (Do Not Track / Global Privacy Control) — the
// backend folds those rules into /api/privacy/consent's `effective` value.
//
// Everything here is intentionally fail-soft: any fetch/parsing error silently
// disables tracking for the session.

interface PocketbaseAnalyticsTarget {
  clientUrl: string;
  pageviewsCollection: string;
  clicksCollection: string;
}

// undefined = config not fetched yet, null = disabled for this session.
let target: PocketbaseAnalyticsTarget | null | undefined;
let consent: boolean | null = null;

function visitorId(): string {
  try {
    let id = sessionStorage.getItem("bp_pb_vid");
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem("bp_pb_vid", id);
    }
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

async function getTarget(): Promise<PocketbaseAnalyticsTarget | null> {
  if (target === undefined) {
    try {
      const res = await api.getExternalAnalyticsConfig();
      const pb = res.success ? res.data?.pocketbase : undefined;
      target = pb?.enabled ? { clientUrl: pb.clientUrl, pageviewsCollection: pb.pageviewsCollection, clicksCollection: pb.clicksCollection } : null;
    } catch {
      target = null;
    }
  }
  return target;
}

async function hasConsent(): Promise<boolean> {
  if (consent === null) {
    try {
      const res = await fetch("/api/privacy/consent", { credentials: "same-origin" });
      const json = (await res.json()) as { data?: { effective?: string } };
      consent = json?.data?.effective === "accept";
    } catch {
      consent = false;
    }
  }
  return consent;
}

/** Drop the cached consent value so a consent change mid-session takes effect. */
export function resetPocketbaseConsentCache(): void {
  consent = null;
}

export function resetPocketbaseTargetCache(): void {
  target = undefined;
}

async function postEvent(
  collection: string,
  data: Record<string, string>
): Promise<void> {
  const cfg = await getTarget();
  if (!cfg) return;
  try {
    await fetch(`${cfg.clientUrl.replace(/\/+$/, "")}/api/collections/${encodeURIComponent(collection)}/records`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  } catch {
    // Fail soft — a network hiccup must never break the profile page.
  }
}

/**
 * Record one pageview for a profile. PublicProfile calls this once per slug
 * per profile page mount (module-level dedupe keeps SPA navigation sane).
 */
const pageviewed = new Set<string>();

export async function trackPocketbasePageview(slug: string, url: string, referrer: string): Promise<void> {
  if (!slug || pageviewed.has(slug)) return;
  const cfg = await getTarget();
  if (!cfg || !(await hasConsent())) return;
  pageviewed.add(slug);
  // Fire the request after dedupe/consent so a disabled feature never blocks.
  await postEvent(cfg.pageviewsCollection, {
    profileSlug: slug,
    visitorId: visitorId(),
    url,
    referrer,
  });
}

/** Record a link click on a profile. */
export async function trackPocketbaseClick(
  slug: string,
  platform: string,
  url: string,
  label: string
): Promise<void> {
  if (!slug) return;
  const cfg = await getTarget();
  if (!cfg || !(await hasConsent())) return;
  await postEvent(cfg.clicksCollection, {
    profileSlug: slug,
    visitorId: visitorId(),
    platform,
    url,
    label,
  });
}