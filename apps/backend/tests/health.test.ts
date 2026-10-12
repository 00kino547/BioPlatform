import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import app from "../src/app.js";
import { buildHealthReport, runHealthChecks } from "../src/lib/health.js";

// Two layers:
// 1. Integration over the real (test) database: the report must be fully green.
//    This is the exact probe that would have flagged the missing `hide_ads`
//    column — the check reads every scalar column of every core model through
//    the real Prisma client, so a column the schema never created throws here.
// 2. Unit: the report builder + drift parser turn a P2021 message into a
//    precise `status: degraded` + `issues` entry instead of a bare "ok".

// --- Unit-level: report builder + P2021 parsing (no database needed) ----------

describe("buildHealthReport", () => {
  test("healthy when every probe passes", () => {
    const report = buildHealthReport(
      { ok: true, latencyMs: 2 },
      [
        { model: "profile", issue: null },
        { model: "user", issue: null },
      ],
      { ok: true, detail: "PONG" },
    );
    assert.equal(report.status, "ok");
    assert.deepEqual(report.issues, []);
    assert.equal(report.checks.schema.ok, true);
    assert.deepEqual(report.checks.schema.drift, []);
    assert.ok(report.checks.schema.probedModels.includes("profile"));
    assert.ok(report.checks.app.name.length > 0);
  });

  test("surfaces a missing column like the profiles.hide_ads incident", () => {
    // The exact Prisma P2021 message every profile route threw before the
    // migration was applied.
    const report = buildHealthReport(
      { ok: true, latencyMs: 1 },
      [
        { model: "profile", issue: "The column `profiles.hide_ads` does not exist in the current database." },
        { model: "user", issue: null },
      ],
      { ok: true, detail: "PONG" },
    );
    assert.equal(report.status, "degraded");
    assert.equal(report.checks.schema.ok, false);
    assert.equal(report.checks.schema.drift.length, 1);
    assert.equal(report.checks.schema.drift[0].model, "profile");
    assert.equal(report.checks.schema.drift[0].table, "profiles");
    assert.equal(report.checks.schema.drift[0].column, "hide_ads");
    assert.match(report.issues[0], /Missing column `?profiles\.hide_ads`?/);
  });

  test("surfaces a missing table", () => {
    const report = buildHealthReport(
      { ok: true, latencyMs: 1 },
      [{ model: "tip", issue: "The table `public.tips` does not exist in the current database." }],
      { ok: true, detail: "PONG" },
    );
    assert.equal(report.status, "degraded");
    assert.equal(report.checks.schema.drift[0].table, "public.tips");
    assert.match(report.issues[0], /Missing table/);
  });

  test("degraded when the database is unreachable", () => {
    const report = buildHealthReport({ ok: false, latencyMs: null }, [], { ok: true, detail: "PONG" });
    assert.equal(report.status, "degraded");
    assert.match(report.issues[0], /database unreachable/);
  });
});

describe("runHealthChecks with injected probes", () => {
  test("status ok when every injected probe passes", async () => {
    const report = await runHealthChecks({
      pingDb: async () => ({ ok: true, latencyMs: 1 }),
      probeModel: async () => ({ model: "x", issue: null }),
      pingCache: async () => ({ ok: false, detail: "redis unreachable (informational)" }),
    });
    // Cache failure must NOT degrade the status — the cache is best-effort.
    assert.equal(report.status, "ok");
    assert.equal(report.checks.cache.ok, false);
  });

  test("status degraded when an injected probe reports a missing column", async () => {
    // Only the first probed model drifts; the rest pass, mirroring a single
    // missed migration (like hide_ads) rather than a fully broken DB.
    let called = 0;
    const report = await runHealthChecks({
      pingDb: async () => ({ ok: true, latencyMs: 1 }),
      probeModel: async () => {
        called += 1;
        return called === 1
          ? { model: "profile", issue: "The column `profiles.hide_ads` does not exist in the current database." }
          : { model: "ok", issue: null };
      },
      pingCache: async () => ({ ok: true, detail: "PONG" }),
    });
    assert.equal(report.status, "degraded");
    assert.equal(report.checks.schema.drift.length, 1);
    assert.equal(report.checks.schema.drift[0].column, "hide_ads");
    assert.equal(report.issues.length, 1);
  });
});

// --- Integration: real app, real test database ---------------------------------

describe("GET /api/health route", () => {
  let server: Server;
  let baseUrl: string;

  before(() => {
    const r = app.listen(0);
    server = r;
    return new Promise<void>((resolve) => r.on("listening", resolve)).then(() => {
      const addr = r.address();
      baseUrl = typeof addr === "object" && addr ? `http://127.0.0.1:${addr.port}` : "";
    });
  });
  after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  test("reports fully green against the real test database", async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, "ok");
    assert.equal(body.checks.database.ok, true);
    assert.equal(body.checks.schema.ok, true);
    assert.deepEqual(body.checks.schema.drift, []);
    assert.deepEqual(body.issues, []);
    assert.ok(body.checks.schema.probedModels.length >= 8);
    assert.ok(typeof body.checks.cache.driver === "string");
    assert.ok(Number.isInteger(body.checks.app.uptimeSeconds));
  });
});