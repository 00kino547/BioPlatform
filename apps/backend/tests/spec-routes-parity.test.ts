import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { openapi } from "../src/lib/openapi.js";
import { collectSourceRoutes } from "./helpers/route-index.js";

// Guard for the "0 missing / 0 stale" invariant that docs/en/api.md and the
// ApiDocs page depend on. Two directions, both must hold:
//   * a route added to app.ts/routes but absent from the spec is MISSING —
//     visitors lose documentation for a real endpoint;
//   * a path advertised in the spec with no Express route behind it is STALE —
//     the reference promises an endpoint the server will answer with 404.
//
// The spec's `paths` keys are relative to `servers: [{ url: "/api" }]`, so a
// spec key `/media/proxy` and an Express route `GET /api/media/proxy` are the
// same endpoint; both sides are normalized to `METHOD /api/<path>`.

/** Canonical path form both sides are folded to (see helpers/route-index.ts). */
const toOpenApiPath = (pathPart: string): string => {
  const withBraces = pathPart.replace(/:[A-Za-z0-9_]+/g, (seg) => `{${seg.slice(1)}}`);
  return withBraces.length > 1 ? withBraces.replace(/\/+$/, "") : withBraces;
};

describe("OpenAPI spec <-> Express routes parity", () => {
  const source = collectSourceRoutes();

  const spec = new Set<string>();
  for (const [relPath, methods] of Object.entries(
    openapi.paths as Record<string, Record<string, unknown>>,
  )) {
    const prefix = relPath.startsWith("/api") ? "" : "/api";
    for (const method of ["get", "post", "put", "patch", "delete"] as const) {
      if (methods[method]) spec.add(`${method.toUpperCase()} ${prefix}${toOpenApiPath(relPath)}`);
    }
  }

  test("every Express route is documented in the OpenAPI spec", () => {
    const missing = [...source].filter((route) => !spec.has(route)).sort();
    assert.deepEqual(
      missing,
      [],
      `routes with no spec entry (docs would go stale):\n${missing.join("\n")}`,
    );
  });

  test("every documented endpoint maps to a real Express route", () => {
    const stale = [...spec].filter((route) => !source.has(route)).sort();
    assert.deepEqual(
      stale,
      [],
      `spec-only endpoints (the server would 404 them):\n${stale.join("\n")}`,
    );
  });

  test("source and spec register the same number of endpoints", () => {
    assert.equal(source.size, spec.size, "route-method counts diverged between app.ts and openapi.ts");
  });
});