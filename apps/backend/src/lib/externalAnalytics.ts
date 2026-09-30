import { getEnv, type Env } from "../config/env.js";
import { buildPocketbaseConfig, POCKETBASE_COLLECTIONS } from "./pocketbase/index.js";

export type ExternalAnalyticsProvider = "none" | "matomo";

export interface ExternalAnalyticsConfig {
  provider: ExternalAnalyticsProvider;
  enabled: boolean;
  matomoUrl: string;
  matomoSiteId: number;
  /**
   * PocketBase-backed analytics. When enabled, the browser-side loader pushes
   * pageview/link-click events into PB collections via the (proxied) client
   * URL — independent of the matomo path above.
   */
  pocketbase: {
    enabled: boolean;
    clientUrl: string;
    pageviewsCollection: string;
    clicksCollection: string;
  };
}

export function buildExternalAnalyticsConfig(env: Env): ExternalAnalyticsConfig {
  const matomoUrl = env.ANALYTICS_MATOMO_URL.trim().replace(/\/+$/, "");
  const enabled = env.ANALYTICS_PROVIDER === "matomo" && Boolean(matomoUrl) && env.ANALYTICS_MATOMO_SITE_ID > 0;
  const pb = buildPocketbaseConfig(env);
  return {
    provider: env.ANALYTICS_PROVIDER,
    enabled,
    matomoUrl,
    matomoSiteId: env.ANALYTICS_MATOMO_SITE_ID,
    pocketbase: {
      enabled: pb.enabled && pb.analyticsEnabled,
      clientUrl: pb.clientUrl,
      pageviewsCollection: POCKETBASE_COLLECTIONS.pageviews,
      clicksCollection: POCKETBASE_COLLECTIONS.linkclicks,
    },
  };
}

export function getExternalAnalyticsConfig(): ExternalAnalyticsConfig {
  return buildExternalAnalyticsConfig(getEnv());
}