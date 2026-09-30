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
});
