import { getEnv, type Env } from "../config/env.js";

export type ExternalAnalyticsProvider = "none" | "matomo";

export interface ExternalAnalyticsConfig {
  provider: ExternalAnalyticsProvider;
  enabled: boolean;
  matomoUrl: string;
  matomoSiteId: number;
}

export function buildExternalAnalyticsConfig(env: Env): ExternalAnalyticsConfig {
  const matomoUrl = env.ANALYTICS_MATOMO_URL.trim().replace(/\/+$/, "");
  const enabled = env.ANALYTICS_PROVIDER === "matomo" && Boolean(matomoUrl) && env.ANALYTICS_MATOMO_SITE_ID > 0;
  // Matomo is the only external analytics provider. The former PocketBase
  // analytics module was removed: it wrote a second, never-read copy of the
  // pageviews/link clicks PostgreSQL already stored, aggregated and pruned, and
  // it exposed an unauthenticated public write endpoint in front of it. All
  // BioPlatform analytics now goes through the backend into PostgreSQL.
  return {
    provider: env.ANALYTICS_PROVIDER,
    enabled,
    matomoUrl,
    matomoSiteId: env.ANALYTICS_MATOMO_SITE_ID,
  };
}

export function getExternalAnalyticsConfig(): ExternalAnalyticsConfig {
  return buildExternalAnalyticsConfig(getEnv());
}