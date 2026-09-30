import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { validateEnv } from "../src/config/env.js";

// Regression: `JWT_EXPIRES_IN` is consumed by jsonwebtoken as `expiresIn`, which
// throws "invalid expiresIn option" for an empty string. Zod's `.default()` only
// covers an *absent* variable, so an empty value (`JWT_EXPIRES_IN=` in a .env)
// used to slip through validation and crash the first token sign. The schema must
// coerce a blank/whitespace value back to the 7d default while preserving any
// real configured value.
const base = {
  DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
  JWT_SECRET: "x".repeat(64),
  NODE_ENV: "test",
};

describe("JWT_EXPIRES_IN blank-value hardening", () => {
  test("an absent value falls back to the 7d default", () => {
    const r = validateEnv({ ...base });
    assert.equal(r.success, true, r.success ? "" : r.issues.join("; "));
    if (r.success) assert.equal(r.data.JWT_EXPIRES_IN, "7d");
  });

  test("an empty string falls back to 7d instead of crashing token signing", () => {
    const r = validateEnv({ ...base, JWT_EXPIRES_IN: "" });
    assert.equal(r.success, true, r.success ? "" : r.issues.join("; "));
    if (r.success) assert.equal(r.data.JWT_EXPIRES_IN, "7d");
  });

  test("a whitespace-only value falls back to 7d", () => {
    const r = validateEnv({ ...base, JWT_EXPIRES_IN: "   " });
    assert.equal(r.success, true, r.success ? "" : r.issues.join("; "));
    if (r.success) assert.equal(r.data.JWT_EXPIRES_IN, "7d");
  });

  test("a real configured value is preserved (trimmed)", () => {
    const r = validateEnv({ ...base, JWT_EXPIRES_IN: " 30d " });
    assert.equal(r.success, true, r.success ? "" : r.issues.join("; "));
    if (r.success) assert.equal(r.data.JWT_EXPIRES_IN, "30d");
  });

  // `JWT_SECRET` is the one required field the schema deliberately refuses to
  // default (production must never silently get a weak secret), which made it
  // the only remaining way for a `.env`-less CI runner to make `getEnv()` print
  // "Invalid environment variables" and `process.exit(1)` — killing every test
  // file that touches the env at import time. `tests/setup-env.ts` now pins a
  // test-only fallback, so a test run with no `.env` still resolves a usable
  // secret. These assertions lock that behaviour in: if the fallback is removed
  // or shortened below the schema's min(32), this file fails loudly with a
  // readable message instead of the whole suite dying at import.
  describe("test environment supplies a usable JWT_SECRET without a .env", () => {
    test("the schema still rejects a missing JWT_SECRET (the field stays defaultless)", () => {
      const { JWT_SECRET: _omitted, ...withoutSecret } = base;
      const r = validateEnv({ ...withoutSecret });
      assert.equal(r.success, false, "JWT_SECRET must remain required for non-test callers");
      if (!r.success) {
        // `validateEnv` returns pre-formatted "path: message" strings.
        const detail = r.issues.join("; ");
        assert.ok(detail.includes("JWT_SECRET"), `expected a JWT_SECRET issue, got: ${detail}`);
      }
    });

    test("setup-env pins a fallback that satisfies the schema", () => {
      const pinned = process.env.JWT_SECRET ?? "";
      assert.ok(pinned.length >= 32, `pinned JWT_SECRET is only ${pinned.length} chars (schema needs 32+)`);
      const r = validateEnv({ ...base, JWT_SECRET: pinned });
      assert.equal(r.success, true, r.success ? "" : r.issues.join("; "));
    });
  });
});
