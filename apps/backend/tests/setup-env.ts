import { readFileSync } from "node:fs";

// The test runner works the same on a fresh clone or in CI as it does on a
// developer machine with a populated `.env`. A missing `.env` must never turn
// into an opaque crash — the process env / defaults below are enough for the
// deterministic test configuration (affiliate/billing/cache/SSO/captcha/gateway
// values are pinned further down regardless of the local `.env`).
// Tooling note: previously `readFileSync` threw here, so `pnpm test` failed
// with an empty/cryptic ENOENT before a single test ran when `.env` was absent.
const envPath = new URL("../../../.env", import.meta.url);
let raw = "";
try {
  raw = readFileSync(envPath, "utf8");
} catch {
  raw = "";
}

for (const line of raw.split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eq = trimmed.indexOf("=");
  if (eq === -1) continue;
  const key = trimmed.slice(0, eq).trim();
  const value = trimmed.slice(eq + 1).trim();
  if (key && !(key in process.env)) {
    process.env[key] = value;
  }
}

const password = process.env.POSTGRES_PASSWORD ?? "postgres";
const testDatabaseUrl = `postgresql://postgres:${encodeURIComponent(password)}@127.0.0.1:5432/bioplatform_test?schema=public`;

if (!testDatabaseUrl.includes("bioplatform_test")) {
  throw new Error("Test DATABASE_URL must point at the bioplatform_test database");
}

process.env.DATABASE_URL = testDatabaseUrl;
process.env.NODE_ENV = "test";

// `JWT_SECRET` is the one schema field with no default that a test run cannot
// invent on its own, and it is deliberately defaultless: production must supply
// a real 32+ char secret and must never silently get a weak one. The previous
// code relied on the developer's repo `.env` to provide it, so a CI runner (no
// `.env` at all) hit `Invalid environment variables: { JWT_SECRET: ['Required'] }`
// and `getEnv()` called `process.exit(1)`. Because that happens at import time,
// the node:test runner did not report one broken assertion — it reported 30 whole
// test FILES as `not ok` with a bare `test failed`, hiding one trivial env gap
// behind what looked like a catastrophic, 30-file breakage. Pin an obviously
// fake, deterministic, test-only secret here instead: it is only ever used to
// sign/verify tokens inside the test process, never to authenticate anything
// real, and CI (which has no `.env`) now boots exactly like a local run.
// `!(key in process.env)`-style precedence is preserved above, so an explicit
// JWT_SECRET from the shell or `.env` still wins; this is only the last resort.
if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = "test-only-jwt-secret-never-used-in-production-0000";
}
