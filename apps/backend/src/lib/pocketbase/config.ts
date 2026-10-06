import { getEnv, type Env } from "../../config/env.js";

// PocketBase support is opt-in and exists for a single purpose: the optional
// sign-in provider. Nothing in core BioPlatform depends on it — with the URL
// empty (or PocketBase down) the platform behaves exactly as if it were not
// installed. The server base URL is what the backend talks to (either the
// bundled compose service `http://pocketbase:8090` or an external instance); the
// client URL is what the BROWSER talks to (relative `/api/pb-speed` proxied by
// nginx in the bundled stack, or the absolute public URL of an external PB) so
// the sign-in form posts credentials same-origin and they never reach us.
export interface PocketbaseConfig {
  /** True when the operator configured a server-side base URL at all. */
  enabled: boolean;
  /** Server-facing PocketBase base URL (http/https only). */
  url: string;
  /** Browser-facing PocketBase API base (relative proxy path or absolute URL). */
  clientUrl: string;
  /** Superuser email used for server-side internal reads. */
  adminEmail: string;
  /** Superuser password used for server-side internal reads. */
  adminPassword: string;
  /** Auth collection holding end-user records (default `users`). */
  authCollection: string;
  /** Sign-in module enabled (PB auth-with-password + token handoff). */
  oauthEnabled: boolean;
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
    oauthEnabled: env.POCKETBASE_OAUTH_ENABLED,
  };
}

/** Read the process-wide PocketBase config (cached, validated env). */
export function getPocketbaseConfig(): PocketbaseConfig {
  return buildPocketbaseConfig(getEnv());
}