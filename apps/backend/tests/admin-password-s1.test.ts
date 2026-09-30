import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { validateEnv } from "../src/config/env.js";

// S1 regression: the admin password must never be a known/weak value in
// production, and it must always be explicitly configured there.
const base = {
  DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
  JWT_SECRET: "x".repeat(64),
};

describe("S1: known weak admin password is rejected in production", () => {
  test("the scaffold default (admin123456) is blocked", () => {
    const r = validateEnv({ ...base, NODE_ENV: "production", ADMIN_PASSWORD: "admin123456" });
    assert.equal(r.success, false);
    assert.ok(r.issues.some((issue) => issue.startsWith("ADMIN_PASSWORD")), r.issues.join("; "));
  });

  test("a length-valid but predictable variant (Admin123456!) is blocked", () => {
    const r = validateEnv({ ...base, NODE_ENV: "production", ADMIN_PASSWORD: "Admin123456!" });
    assert.equal(r.success, false);
    assert.ok(r.issues.some((issue) => issue.startsWith("ADMIN_PASSWORD")), r.issues.join("; "));
  });

  test("other known weak values are blocked", () => {
    for (const value of ["admin1234567890", "password123456"]) {
      const r = validateEnv({ ...base, NODE_ENV: "production", ADMIN_PASSWORD: value });
      assert.equal(r.success, false, `"${value}" must be rejected`);
    }
  });

  test("production without an explicit ADMIN_PASSWORD is rejected", () => {
    const r = validateEnv({ ...base, NODE_ENV: "production" });
    assert.equal(r.success, false);
    assert.ok(r.issues.some((issue) => issue.startsWith("ADMIN_PASSWORD")), r.issues.join("; "));
  });

  test("a fresh, strong production password is accepted", () => {
    const r = validateEnv({ ...base, NODE_ENV: "production", ADMIN_PASSWORD: "k3A!9nWx2#pQ7$LmR5@zT" });
    assert.equal(r.success, true);
  });
});

describe("S1: the dev/test ADMIN_PASSWORD scaffold default is schema-valid", () => {
  test("a non-production parse with no ADMIN_PASSWORD succeeds through the scaffold default", () => {
    const r = validateEnv({ ...base, NODE_ENV: "test" });
    assert.equal(r.success, true, r.success ? "" : r.issues.join("; "));
    if (r.success) {
      const length = r.data.ADMIN_PASSWORD.length;
      assert.ok(length >= 12, `scaffold default must satisfy the schema's min(12), got ${length} chars`);
    }
  });

  test("the scaffold default itself is rejected in production (no explicit ADMIN_PASSWORD is ever acceptable there)", () => {
    const r = validateEnv({ ...base, NODE_ENV: "production" });
    assert.equal(r.success, false);
    assert.ok(r.issues.some((issue) => issue.startsWith("ADMIN_PASSWORD")), r.issues.join("; "));
  });
});