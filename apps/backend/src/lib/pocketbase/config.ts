import { getEnv, type Env } from "../../config/env.js";

// PocketBase support is opt-in per module. All four booleans default to false —
// the operator flips each one on individually, as with the LINKS_*_ENABLED
// flags. The server base URL is what the backend talks to (either the bundled
// compose service `http://pocketbase:8090` or an external instance); the client
// URL is what the BROWSER loader talks to (relative `/api/pb-speed` proxied by
// nginx in the bundled stack, or the absolute public URL of an external PB).
export interface PocketbaseConfig {
  /** True when the operator configured a server-side base URL at all. */
  enabled: boolean;
  /** Server-facing PocketBase base URL (http/https only). */
  url: string;
  /** Browser-facing PocketBase API base (relative proxy path or absolute URL). */
  clientUrl: string;
  /** Superuser email used for server-side bootstrap/collection management. */
  adminEmail: string;
  /** Superuser password used for server-side bootstrap/collection management. */
  adminPassword: string;
  /** Auth collection holding end-user records (default `users`). */
  authCollection: string;
  /** Whether the backend may auto-bootstrap collections on start. */
  bootstrap: boolean;
  /** Analytics module enabled (loader pushes events into PB collections). */
  analyticsEnabled: boolean;
  /** OAuth/SSO module enabled (PB auth-with-password + token handoff). */
  oauthEnabled: boolean;
  /** Storage module enabled (uploads stored as PB file-field records). */
  storageEnabled: boolean;
  /** Content module enabled (per-profile PB content block on the public page). */
  contentEnabled: boolean;
  /** Max upload size in MB accepted for PB-backed storage uploads. */
  maxUploadMb: number;
}

/**
 * Build the PocketBase config from a raw (usually validated) environment.
 * Extracted from `getPocketbaseConfig` so pure unit tests can pass an explicit
 * env object without booting the process-wide config.
 */
export function buildPocketbaseConfig(env: Env): PocketbaseConfig {
  const url = env.POCKETBASE_URL.trim().replace(/\/+$/, "");
  const clientUrl =
    env.POCKETBASE_CLIENT_URL.trim().replace(/\/+$/, "") || "/api/pb-speed";
  return {
    enabled: Boolean(url),
    url,
    clientUrl,
    adminEmail: env.POCKETBASE_ADMIN_EMAIL.trim(),
    adminPassword: env.POCKETBASE_ADMIN_PASSWORD,
    authCollection: env.POCKETBASE_AUTH_COLLECTION.trim() || "users",
    bootstrap: env.POCKETBASE_BOOTSTRAP,
    analyticsEnabled: env.POCKETBASE_ANALYTICS_ENABLED,
    oauthEnabled: env.POCKETBASE_OAUTH_ENABLED,
    storageEnabled: env.POCKETBASE_STORAGE_ENABLED,
    contentEnabled: env.POCKETBASE_CONTENT_ENABLED,
    maxUploadMb: env.POCKETBASE_MAX_UPLOAD_MB,
  };
}

/** Read the process-wide PocketBase config (cached, validated env). */
export function getPocketbaseConfig(): PocketbaseConfig {
  return buildPocketbaseConfig(getEnv());
}