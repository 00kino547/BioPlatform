import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { updateProfileSchema } from "../src/lib/validation.js";

describe("presence status and countdown (Phase 2)", () => {
  test("accepts a valid presenceStatus", () => {
    for (const value of ["online", "idle", "offline"]) {
      const result = updateProfileSchema.safeParse({ presenceStatus: value });
      assert.ok(result.success, `expected ${value} to be accepted`);
    }
  });

  test("accepts null and undefined presenceStatus (hidden)", () => {
    assert.ok(updateProfileSchema.safeParse({ presenceStatus: null }).success);
    assert.ok(updateProfileSchema.safeParse({}).success);
  });

  test("rejects an invalid presenceStatus value", () => {
    const result = updateProfileSchema.safeParse({ presenceStatus: "busy" });
    assert.ok(!result.success);
  });

  test("accepts a valid countdown with label and targetDate", () => {
    const result = updateProfileSchema.safeParse({
      countdown: { label: "Launch in", targetDate: "2026-12-01T00:00:00.000Z" },
    });
    assert.ok(result.success, result.error?.issues[0]?.message ?? "");
    if (result.success) {
      assert.equal(result.data.countdown?.label, "Launch in");
      assert.equal(result.data.countdown?.targetDate, "2026-12-01T00:00:00.000Z");
    }
  });

  test("sanitizes the countdown label", () => {
    const result = updateProfileSchema.safeParse({
      countdown: { label: "  <b>Launch</b> {day}  ", targetDate: "2026-12-01" },
    });
    assert.ok(result.success, result.error?.issues[0]?.message ?? "");
    if (result.success) {
      assert.equal(result.data.countdown?.label, "bLaunch/b day");
    }
  });

  test("empty countdown label becomes undefined", () => {
    const result = updateProfileSchema.safeParse({
      countdown: { label: "   ", targetDate: "2026-12-01" },
    });
    assert.ok(result.success);
    if (result.success) {
      assert.equal(result.data.countdown?.label, undefined);
    }
  });

  test("rejects an invalid countdown targetDate", () => {
    const result = updateProfileSchema.safeParse({
      countdown: { label: "Launch", targetDate: "not-a-date" },
    });
    assert.ok(!result.success);
  });

  test("rejects an oversized countdown label (max 60)", () => {
    const result = updateProfileSchema.safeParse({
      countdown: { label: "x".repeat(61), targetDate: "2026-12-01" },
    });
    assert.ok(!result.success);
  });

  test("accepts null and undefined countdown (hidden)", () => {
    assert.ok(updateProfileSchema.safeParse({ countdown: null }).success);
    assert.ok(updateProfileSchema.safeParse({}).success);
  });

  test("presenceStatus and countdown combine with other profile fields", () => {
    const result = updateProfileSchema.safeParse({
      displayName: "Someone",
      website: "https://example.com",
      presenceStatus: "online",
      countdown: { label: "Drop", targetDate: "2026-12-24T18:00:00.000Z" },
      socialLinks: [{ platform: "github", url: "https://github.com/me" }],
    });
    assert.ok(result.success, result.error?.issues[0]?.message ?? "");
    if (result.success) {
      assert.equal(result.data.presenceStatus, "online");
      assert.equal(result.data.countdown?.targetDate, "2026-12-24T18:00:00.000Z");
    }
  });
});