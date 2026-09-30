import { test, describe, afterEach } from "node:test";
import assert from "node:assert/strict";
import { validateEnv } from "../src/config/env.js";
import { buildPocketbaseConfig } from "../src/lib/pocketbase/config.js";
import {
  authAsLegacyAdmin,
  createPocketBaseClient,
  resetPocketbaseTokenCache,
} from "../src/lib/pocketbase/client.js";
import {
  POCKETBASE_COLLECTIONS,
  bootstrapPocketbaseCollections,
} from "../src/lib/pocketbase/bootstrap.js";
import { buildExternalAnalyticsConfig } from "../src/lib/externalAnalytics.js";

// Deterministic raw env for pure config builders. `validateEnv` fills every
// default so we get a fully-shaped Env object without touching process.env.
const BASE_RAW = {
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://postgres:x@127.0.0.1:5432/bioplatform_test?schema=public",
  JWT_SECRET: "a".repeat(32),
};

function makeEnv(extra: Record<string, unknown> = {}) {
  const result = validateEnv({ ...BASE_RAW, ...extra });
  assert.ok(result.success, "env must validate");
  return result.data;
}

// ---- Mock PocketBase server ---------------------------------------------

interface MockCol {
  id: string;
  name: string;
  fields: unknown[];
}

interface MockPbState {
  collections: Map<string, MockCol>;
  /** Legacy v0.22 mode: the modern `_superusers` endpoint 404s. */
  legacy?: boolean;
  authCalls: number;
  createdBodies: unknown[];
  /** When set, every request throws (simulates an unreachable PocketBase). */
  down?: boolean;
}

function mockJson(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function installMockPocketbase(state: MockPbState): { restore: () => void } {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> => {
    if (state.down) throw new Error("network unreachable");
    const url =
      typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const method = init?.method ?? "GET";
    const u = new URL(url);
    const path = u.pathname;

    if (path.endsWith("/auth-with-password")) {
      if (path.includes("/_superusers/") && !state.legacy) {
        state.authCalls += 1;
        return mockJson(200, {
          token: "superuser-token-1",
          record: { id: "s1", email: "admin@x.test" },
        });
      }
      if (path.endsWith("/api/admins/auth-with-password")) {
        state.authCalls += 1;
        return mockJson(200, {
          token: "admin-token-1",
          admin: { id: "a1", email: "admin@x.test" },
        });
      }
      return mockJson(404, { code: 404, message: "Not found." });
    }

    if (path === "/api/collections") {
      if (method === "GET") {
        return mockJson(200, {
          page: 1,
          perPage: 200,
          totalItems: state.collections.size,
          totalPages: 1,
          items: [...state.collections.values()].map((c) => ({
            id: c.id,
            name: c.name,
            type: "base",
            fields: c.fields,
          })),
        });
      }
      if (method === "POST") {
        const body = JSON.parse(String(init?.body ?? "{}")) as {
          name: string;
          fields?: unknown[];
          schema?: unknown[];
        };
        const fields = body.fields ?? body.schema ?? [];
        state.collections.set(body.name, {
          id: `col_${state.collections.size + 1}`,
          name: body.name,
          fields,
        });
        state.createdBodies.push(body);
        return mockJson(200, { id: `col_${state.collections.size}`, name: body.name, type: "base" });
      }
      return mockJson(404, { code: 404, message: "Not found." });
    }

    const collectionMatch = /^\/api\/collections\/([^/]+)$/.exec(path);
    if (collectionMatch && method === "GET") {
      const name = decodeURIComponent(collectionMatch[1]);
      const col = state.collections.get(name);
      if (col) return mockJson(200, col);
      return mockJson(404, { code: 404, message: "Not found." });
    }

    return mockJson(404, { code: 404, message: `No mock route: ${method} ${path}` });
  }) as typeof fetch;

  return {
    restore: () => {
      globalThis.fetch = originalFetch;
    },
  };
}

function freshState(legacy = false): MockPbState {
  return {
    collections: new Map(),
    legacy,
    authCalls: 0,
    createdBodies: [],
  };
}

let restoreFn: (() => void) | null = null;
afterEach(() => {
  restoreFn?.();
  restoreFn = null;
  resetPocketbaseTokenCache();
});

// ---- Tests ---------------------------------------------------------------

describe("buildPocketbaseConfig", () => {
  test("trims trailing slashes and applies defaults", () => {
    const env = makeEnv({
      POCKETBASE_URL: "https://pb.example.com/",
      POCKETBASE_ADMIN_EMAIL: "admin@x.test",
      POCKETBASE_ADMIN_PASSWORD: "secret",
    });
    const cfg = buildPocketbaseConfig(env);
    assert.equal(cfg.url, "https://pb.example.com");
    assert.equal(cfg.clientUrl, "/api/pb-speed");
    assert.equal(cfg.authCollection, "users");
    assert.equal(cfg.enabled, true);
    assert.equal(cfg.bootstrap, true);
    assert.equal(cfg.maxUploadMb, 50);
    // All module flags default OFF.
    assert.equal(cfg.analyticsEnabled, false);
    assert.equal(cfg.oauthEnabled, false);
    assert.equal(cfg.storageEnabled, false);
    assert.equal(cfg.contentEnabled, false);
  });

  test("disabled when POCKETBASE_URL is empty", () => {
    const cfg = buildPocketbaseConfig(makeEnv({ POCKETBASE_URL: "" }));
    assert.equal(cfg.enabled, false);
    assert.equal(cfg.url, "");
  });
});

describe("buildExternalAnalyticsConfig", () => {
  test("pocketbase analytics requires URL + analytics flag", () => {
    const env = makeEnv({
      POCKETBASE_URL: "http://mock-pb",
      POCKETBASE_ANALYTICS_ENABLED: "true",
    });
    const cfg = buildExternalAnalyticsConfig(env);
    assert.equal(cfg.pocketbase.enabled, true);
    assert.equal(cfg.pocketbase.clientUrl, "/api/pb-speed");
    assert.equal(cfg.pocketbase.pageviewsCollection, POCKETBASE_COLLECTIONS.pageviews);
    assert.equal(cfg.pocketbase.clicksCollection, POCKETBASE_COLLECTIONS.linkclicks);
  });

  test("pocketbase analytics off without the flag even when URL is set", () => {
    const env = makeEnv({ POCKETBASE_URL: "http://mock-pb" });
    const cfg = buildExternalAnalyticsConfig(env);
    assert.equal(cfg.pocketbase.enabled, false);
  });
});

describe("PocketBase superuser auth", () => {
  test("authenticates via the modern _superusers endpoint (default)", async () => {
    const state = freshState();
    restoreFn = installMockPocketbase(state).restore;
    const env = makeEnv({ POCKETBASE_URL: "http://mock-pb" });
    const client = createPocketBaseClient(buildPocketbaseConfig(env));
    const auth = await client.superuserToken();
    assert.equal(auth.token, "superuser-token-1");
    assert.equal(auth.kind, "Superuser");
    assert.equal(state.authCalls, 1);
    // Token is cached: a second mint does not hit the network again.
    const again = await client.superuserToken();
    assert.equal(again.token, "superuser-token-1");
    assert.equal(state.authCalls, 1);
  });

  test("falls back to the legacy /api/admins endpoint on 404", async () => {
    const state = freshState(true);
    restoreFn = installMockPocketbase(state).restore;
    const env = makeEnv({ POCKETBASE_URL: "http://mock-pb" });
    const client = createPocketBaseClient(buildPocketbaseConfig(env));
    const auth = await client.superuserToken();
    assert.equal(auth.token, "admin-token-1");
    assert.equal(auth.kind, "Admin");
    // Modern attempt 404'd (not counted), legacy succeeded.
    assert.equal(state.authCalls, 1);
  });

  test("authAsLegacyAdmin works directly against /api/admins", async () => {
    const state = freshState(true);
    restoreFn = installMockPocketbase(state).restore;
    const env = makeEnv({ POCKETBASE_URL: "http://mock-pb" });
    const auth = await authAsLegacyAdmin(buildPocketbaseConfig(env), "admin@x.test", "secret");
    assert.equal(auth.token, "admin-token-1");
    assert.equal(auth.kind, "Admin");
  });
});

describe("bootstrapPocketbaseCollections", () => {
  test("creates both analytics collections with public-insert rules", async () => {
    const state = freshState();
    restoreFn = installMockPocketbase(state).restore;
    const env = makeEnv({ POCKETBASE_URL: "http://mock-pb" });
    const result = await bootstrapPocketbaseCollections(
      createPocketBaseClient(buildPocketbaseConfig(env))
    );

    assert.equal(result.legacy, false);
    assert.deepEqual(
      result.collections.map((c) => c.name).sort(),
      [POCKETBASE_COLLECTIONS.pageviews, POCKETBASE_COLLECTIONS.linkclicks].sort()
    );
    assert.ok(result.collections.every((c) => c.created), "both collections are new");

    // Public create, no read rules — records can be written anonymously but never read.
    const bodies = state.createdBodies as Array<Record<string, unknown>>;
    assert.equal(bodies.length, 2);
    for (const body of bodies) {
      assert.equal(body.type, "base");
      assert.equal(body.createRule, "");
      assert.equal(body.listRule, null);
      assert.equal(body.viewRule, null);
      assert.equal(body.updateRule, null);
      assert.equal(body.deleteRule, null);
      const fields = body.fields as Array<{ name: string; type: string }>;
      assert.ok(fields.some((f) => f.name === "profileSlug" && f.type === "text"));
    }
  });

  test("is idempotent when the collections already exist", async () => {
    const state = freshState();
    state.collections.set("analytics_pageviews", { id: "c1", name: "analytics_pageviews", fields: [] });
    state.collections.set("analytics_linkclicks", { id: "c2", name: "analytics_linkclicks", fields: [] });
    restoreFn = installMockPocketbase(state).restore;
    const env = makeEnv({ POCKETBASE_URL: "http://mock-pb" });
    const result = await bootstrapPocketbaseCollections(
      createPocketBaseClient(buildPocketbaseConfig(env))
    );
    assert.ok(result.collections.every((c) => !c.created), "nothing created");
    assert.equal(state.createdBodies.length, 0, "no POST /api/collections issued");
  });

  test("fails soft when PocketBase is unreachable", async () => {
    const state = freshState();
    state.down = true;
    restoreFn = installMockPocketbase(state).restore;
    const env = makeEnv({ POCKETBASE_URL: "http://mock-pb" });
    const result = await bootstrapPocketbaseCollections(
      createPocketBaseClient(buildPocketbaseConfig(env))
    );
    assert.ok(result.collections.every((c) => !c.created), "graceful degradation");
  });

  test("no-ops when PocketBase is disabled", async () => {
    const state = freshState();
    restoreFn = installMockPocketbase(state).restore;
    const env = makeEnv({ POCKETBASE_URL: "" });
    const result = await bootstrapPocketbaseCollections(
      createPocketBaseClient(buildPocketbaseConfig(env))
    );
    assert.deepEqual(result, { collections: [], legacy: false });
    assert.equal(state.authCalls, 0, "no auth attempted when disabled");
  });

  test("uses the legacy field schema when the instance is v0.22", async () => {
    const state = freshState(true);
    restoreFn = installMockPocketbase(state).restore;
    const env = makeEnv({ POCKETBASE_URL: "http://mock-pb" });
    const result = await bootstrapPocketbaseCollections(
      createPocketBaseClient(buildPocketbaseConfig(env))
    );
    assert.equal(result.legacy, true);
    const body = state.createdBodies[0] as { schema?: unknown[]; fields?: unknown[] };
    assert.ok(Array.isArray(body.schema), "legacy uses schema not fields");
    assert.equal(body.fields, undefined);
  });
});