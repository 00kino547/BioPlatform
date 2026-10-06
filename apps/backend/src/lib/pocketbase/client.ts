import { getPocketbaseConfig, type PocketbaseConfig } from "./config.js";

// Minimal HTTP wrapper around the PocketBase REST API. v0.23+ calls superusers
// `_superusers` and authenticates through `/api/collections/_superusers/auth-with-password`,
// while v0.22 used `/api/admins/auth-with-password` with an `Admin {token}`
// header. We support both so the feature works against a bundled instance
// (built from source) or a pre-existing/external one (community image).
//
// All calls are made against the operator-configured POCKETBASE_URL — never a
// user-supplied URL — so there is no SSRF surface here. Any client/server fault
// throws a typed PocketBaseError; callers are expected to fail soft (log and
// disable the module) rather than crash the app.

export interface PbRecord {
  id: string;
  collectionId: string;
  collectionName: string;
  created: string;
  updated: string;
  [key: string]: unknown;
}

export interface PbAuthPayload {
  token: string;
  record?: PbRecord;
  admin?: PbRecord;
}

export interface PbCollectionItem {
  id: string;
  name: string;
  type: string;
  /** v0.23+ field descriptors. */
  fields?: Array<{ name: string; type: string; system?: boolean }>;
  /** v0.22 schema descriptors (legacy). */
  schema?: Array<{ name: string; type: string }>;
}

export interface PbListResult<T> {
  page: number;
  perPage: number;
  totalItems: number;
  totalPages: number;
  items: T[];
}

export type SuperuserKind = "Superuser" | "Admin";

export class PocketBaseError extends Error {
  constructor(
    message: string,
    readonly status: number | null = null,
    readonly body: unknown = null
  ) {
    super(message);
    this.name = "PocketBaseError";
  }
}

export interface PbRequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  query?: Record<string, string | number | undefined>;
  body?: unknown;
  token?: string;
  tokenKind?: SuperuserKind;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 10_000;

export async function pbFetchJson<T>(
  baseUrl: string,
  path: string,
  opts: PbRequestOptions = {}
): Promise<T> {
  const {
    method = "GET",
    query,
    body,
    token,
    tokenKind = "Superuser",
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = opts;
  const url = new URL(path, baseUrl);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
  }

  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  // PocketBase v0.40 (and the bundled prebuilt images) authenticate superuser
  // JWTs through the standard `Bearer` scheme — the `Superuser {token}` prefix
  // that older guides used is rejected with 401. Legacy v0.22 admins still need
  // their `Admin {token}` prefix, so we branch on the resolved auth kind.
  if (token) {
    headers.Authorization = tokenKind === "Admin" ? `Admin ${token}` : `Bearer ${token}`;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url.toString(), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await res.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = text;
    }
    if (!res.ok) {
      const msg = extractPbMessage(json) ?? `PocketBase request failed (${res.status})`;
      throw new PocketBaseError(msg, res.status, json);
    }
    return json as T;
  } finally {
    clearTimeout(timer);
  }
}

function extractPbMessage(body: unknown): string | null {
  if (Array.isArray(body)) {
    for (const item of body) {
      const m = extractPbMessage(item);
      if (m) return m;
    }
    return null;
  }
  if (body && typeof body === "object") {
    const obj = body as Record<string, unknown>;
    if (typeof obj.message === "string" && obj.message) return obj.message;
    if (typeof obj.code === "string" && obj.code) return obj.code;
  }
  return null;
}

/**
 * Authenticate with a PocketBase admin/superuser account. Tries the modern
 * `_superusers` collection first (v0.23+), then falls back to `/api/admins`
 * (v0.22). Returns the token plus which auth kind produced it.
 */
export async function authAsSuperuser(
  config: PocketbaseConfig,
  email: string,
  password: string
): Promise<{ token: string; kind: SuperuserKind }> {
  const modern = await pbFetchJson<PbAuthPayload>(
    config.url,
    "/api/collections/_superusers/auth-with-password",
    { method: "POST", body: { identity: email, password }, timeoutMs: 8_000 }
  );
  if (!modern.token) throw new PocketBaseError("PocketBase auth returned no token");
  return { token: modern.token, kind: "Superuser" };
}

// Legacy fallback path: v0.22 admin accounts.
export async function authAsLegacyAdmin(
  config: PocketbaseConfig,
  email: string,
  password: string
): Promise<{ token: string; kind: SuperuserKind }> {
  const res = await pbFetchJson<PbAuthPayload>(config.url, "/api/admins/auth-with-password", {
    method: "POST",
    body: { email, password },
    timeoutMs: 8_000,
  });
  if (!res.token) throw new PocketBaseError("PocketBase admin auth returned no token");
  return { token: res.token, kind: "Admin" };
}

/** List collections (used by bootstrap to check what exists). */
export async function listCollections(
  config: PocketbaseConfig,
  token: string,
  kind: SuperuserKind
): Promise<PbCollectionItem[]> {
  const res = await pbFetchJson<PbListResult<PbCollectionItem>>(config.url, "/api/collections", {
    query: { page: 1, perPage: 200 },
    token,
    tokenKind: kind,
  });
  return res.items ?? [];
}

/** Retrieve a single collection by name (v0.22 returns it under `data` on success). */
export async function getCollection(
  config: PocketbaseConfig,
  name: string,
  token: string,
  kind: SuperuserKind
): Promise<PbCollectionItem | null> {
  try {
    const res = await pbFetchJson<PbCollectionItem | { data: PbCollectionItem }>(
      config.url,
      `/api/collections/${encodeURIComponent(name)}`,
      { token, tokenKind: kind }
    );
    return (res as { data?: PbCollectionItem }).data ?? (res as PbCollectionItem);
  } catch (error) {
    if (error instanceof PocketBaseError && error.status === 404) return null;
    throw error;
  }
}

/**
 * Create a base collection with the given text fields.
 * Analytics collections get `createRule: ""` so the browser loader can insert
 * records anonymously (that's the whole point of client-side analytics) while
 * `listRule`/`viewRule` stay null so records are never readable over the wire.
 */
export async function createCollection(
  config: PocketbaseConfig,
  opts: {
    name: string;
    fields: string[];
    createRule?: string | null;
    listRule?: string | null;
    viewRule?: string | null;
  },
  token: string,
  kind: SuperuserKind,
  isLegacy = false
): Promise<PbCollectionItem> {
  const fieldDefs = opts.fields.map((name) => ({ name, type: "text" }));
  // v0.23 uses `fields`, v0.22 used `schema`.
  const body = isLegacy
    ? { name: opts.name, type: "base", schema: fieldDefs }
    : {
        name: opts.name,
        type: "base",
        fields: fieldDefs,
        createRule: opts.createRule ?? null,
        listRule: opts.listRule ?? null,
        viewRule: opts.viewRule ?? null,
        updateRule: null,
        deleteRule: null,
      };
  return pbFetchJson<PbCollectionItem>(config.url, "/api/collections", {
    method: "POST",
    body,
    token,
    tokenKind: kind,
  });
}

/** Create a record in a collection (anonymous when no token is passed). */
export async function createRecord<T extends PbRecord>(
  config: PocketbaseConfig,
  collection: string,
  data: Record<string, unknown>,
  token?: string,
  kind?: SuperuserKind
): Promise<T> {
  return pbFetchJson<T>(config.url, `/api/collections/${encodeURIComponent(collection)}/records`, {
    method: "POST",
    body: data,
    token,
    tokenKind: kind,
  });
}

/**
 * Server-side proof of a browser-supplied PocketBase sign-in token (OAuth
 * module token-handoff). PocketBase's `/api/collections/{collection}/auth-refresh`
 * returns a fresh token plus the decoded user record when the presented auth
 * token is valid, and a 400/401 otherwise. The browser exchanged its email +
 * password for this token straight against PocketBase, so the platform backend
 * never sees the user's PocketBase password — we only confirm the token and
 * read the identity it encodes.
 */
export interface PbAuthRecordIdentity {
  id: string;
  email: string | null;
  username: string | null;
  name: string | null;
  /** Browser-reachable avatar URL (via the proxied client URL when relative). */
  avatarUrl: string | null;
  /** PB's `verified` boolean on the auth record (email-verified identity). */
  emailVerified: boolean;
}

export async function confirmCollectionAuth(
  config: PocketbaseConfig,
  collection: string,
  authToken: string
): Promise<PbAuthRecordIdentity> {
  const res = await pbFetchJson<PbAuthPayload>(
    config.url,
    `/api/collections/${encodeURIComponent(collection)}/auth-refresh`,
    // A collection *user* token uses the same `Bearer` scheme as a superuser
    // token on v0.40+, which is exactly what pbFetchJson's default emits.
    { method: "POST", token: authToken, tokenKind: "Superuser", timeoutMs: 8_000 }
  );
  const record = res.record ?? res.admin;
  if (!record || !record.id) {
    throw new PocketBaseError("PocketBase auth-refresh returned no record");
  }
  // PB `avatar` fields hold a file name on the PB instance, not a URL.
  const avatar = typeof record.avatar === "string" && record.avatar ? record.avatar : null;
  const avatarUrl = avatar
    ? `${config.clientUrl}/api/files/${encodeURIComponent(record.collectionId)}/${encodeURIComponent(record.id)}/${encodeURIComponent(avatar)}`
    : null;
  return {
    id: record.id,
    email: typeof record.email === "string" && record.email ? record.email : null,
    username: typeof record.username === "string" && record.username ? record.username : null,
    name: typeof record.name === "string" && record.name ? record.name : null,
    avatarUrl,
    emailVerified: record.verified === true,
  };
}

// Cache for a fresh superuser token so bootstrap isn't re-authenticating per run.
const tokenCache = new Map<
  string,
  { expiresAt: number; token: string; kind: SuperuserKind }
>();
const TOKEN_TTL_MS = 45 * 60 * 1000;

/** Drop the cached superuser token (used by tests and credential rotation). */
export function resetPocketbaseTokenCache(): void {
  tokenCache.clear();
}

export interface PocketBaseClient {
  config: PocketbaseConfig;
  /** Cached superuser token (modern vs legacy already resolved on first mint). */
  superuserToken(): Promise<{ token: string; kind: SuperuserKind }>;
}

/**
 * A client bound to the operator's PocketBase config. Caches the superuser token
 * (PocketBase auth tokens default to ~2h; we refresh long before expiry so
 * long-running processes never 401).
 */
export function createPocketBaseClient(config: PocketbaseConfig): PocketBaseClient {
  const cacheKey = config.url;
  return {
    config,
    async superuserToken(): Promise<{ token: string; kind: SuperuserKind }> {
      const cached = tokenCache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) return { token: cached.token, kind: cached.kind };
      let auth: { token: string; kind: SuperuserKind };
      try {
        auth = await authAsSuperuser(config, config.adminEmail, config.adminPassword);
      } catch (error) {
        // Fall back to the legacy admin API when the modern `_superusers`
        // collection is absent (PB before v0.23).
        if (error instanceof PocketBaseError && error.status === 404) {
          auth = await authAsLegacyAdmin(config, config.adminEmail, config.adminPassword);
        } else {
          throw error;
        }
      }
      tokenCache.set(cacheKey, { expiresAt: Date.now() + TOKEN_TTL_MS, token: auth.token, kind: auth.kind });
      return { token: auth.token, kind: auth.kind };
    },
  };
}

/** Convenience: build the client from the process-wide config (used at boot). */
export function defaultPocketBaseClient(): PocketBaseClient {
  return createPocketBaseClient(getPocketbaseConfig());
}