// Route discovery helper for the API-docs parity guard test.
//
// Ports the ad-hoc check historically run as a one-off script
// (/tmp/opencode/routes.gen.mjs) into the test suite: it re-reads app.ts and the
// mounted route modules and returns the exact set of HTTP routes Express will
// serve, so `tests/spec-routes-parity.test.ts` can diff it against the OpenAPI
// spec's paths. Reading the source (not calling the router) keeps the guard
// independent of runtime wiring, and the recursion mirrors the way routers are
// nested through `router.use`.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** Absolute path to apps/backend/src, derived from this helper's own location. */
export const BACKEND_SRC_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../src");

type HttpMethod = "get" | "post" | "put" | "patch" | "delete";

/** Express route params (`:id`) -> the OpenAPI `{id}` spelling, so both sides compare. */
const toOpenApiPath = (expressPath: string): string =>
  expressPath.replace(/:[A-Za-z0-9_]+/g, (seg) => `{${seg.slice(1)}}`);

/**
 * Canonical route form used by the parity diff. Express and OpenAPI spell
 * params differently (`:id` vs `{id}`) and Express joins mounted routers with a
 * trailing slash (`router.get("/")` mounted at `/api/badges` -> `/api/badges/`)
 * that OpenAPI never writes. Both are folded here.
 */
const canonicalRouterPath = (routerPath: string): string => {
  const withBraces = toOpenApiPath(routerPath);
  return withBraces.length > 1 ? withBraces.replace(/\/+$/, "") : withBraces;
};

/**
 * Walk one router file, recording every route it registers and recursing into
 * nested routers mounted through `router.use("/path", child)`.
 */
function walkRouter(filePath: string, prefix: string, out: Set<string>): void {
  const src = readFileSync(filePath, "utf8");
  for (const r of src.matchAll(/router\.(get|post|put|patch|delete)\(\s*"([^"]+)"/g)) {
    out.add(`${(r[1] as HttpMethod).toUpperCase()} ${canonicalRouterPath(prefix + r[2])}`);
  }
  for (const m of src.matchAll(/router\.use\(\s*"([^"]+)",\s*(\w+)/g)) {
    const imported = src.match(new RegExp(`import\\s+${m[2]}\\s+from\\s+"\\.\\/([\\w-]+?)(?:\\.js)?"`));
    if (imported) walkRouter(join(dirname(filePath), `${imported[1]}.ts`), prefix + m[1], out);
  }
}

/**
 * Every HTTP route Express will serve, by reading app.ts and its mounted
 * routers from source. `:param` is normalized to the OpenAPI `{param}` form.
 * Routes are single-line path strings, so multiline declarations are out of scope.
 */
export function collectSourceRoutes(srcDir: string = BACKEND_SRC_DIR): Set<string> {
  const appSrc = readFileSync(join(srcDir, "app.ts"), "utf8");
  const out = new Set<string>();

  // Map each `app.use("/api/...", varName)` back to the route file it came from.
  const routers = new Map<string, string>();
  for (const im of appSrc.matchAll(/import\s+(\w+)\s+from\s+"\.\/routes\/([\w-]+)\.js"/g)) {
    routers.set(im[1], im[2]);
  }

  // Inline routes registered directly with `app.<method>(...)`.
  for (const m of appSrc.matchAll(/app\.(get|post|put|patch|delete)\(\s*"(\/api\/[^"]+)"/g)) {
    out.add(`${(m[1] as HttpMethod).toUpperCase()} ${canonicalRouterPath(m[2])}`);
  }

  // Routers mounted with `app.use("/api/...", routerVar)`.
  for (const m of appSrc.matchAll(/app\.use\(\s*"(\/api(?:\/[^"]+)?)",\s*(\w+)/g)) {
    const rel = routers.get(m[2]);
    if (rel) walkRouter(join(srcDir, "routes", `${rel}.ts`), m[1], out);
  }

  return out;
}