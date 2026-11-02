import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Server } from "node:http";
import app from "../src/app.js";
import { loadInstanceConfig, resetInstanceConfigForTests } from "../src/lib/instanceConfig.js";

// The i18n endpoints are pure reads of the validated `public.i18n` block, so this
// suite needs no database: it boots the real app on an ephemeral port and hits the
// two routes the way the frontend does. The block is the same one served by
// GET /api/config, so the last case cross-checks the two surfaces can't drift.

const dir = mkdtempSync(join(tmpdir(), "bioplatform-i18n-routes-"));
after(() => {
  rmSync(dir, { recursive: true, force: true });
});

function writeConfig(content: string): string {
  const file = join(dir, `config-${Math.random().toString(36).slice(2)}.yml`);
  writeFileSync(file, content, "utf8");
  return file;
}

// i18n enabled with a non-default locale set, so the assertions prove the values
// come from the file rather than the schema defaults.
const ENABLED_CONFIG = `
public:
  i18n:
    enabled: true
    defaultLocale: "es"
    fallbackLocale: "en"
    locales:
      - "en"
      - "es"
      - "de"
`;

// A file without an i18n block must resolve to the all-defaults state, which is
// the inert feature: disabled, English default/fallback, en+es shipped.
const DEFAULT_CONFIG = `
public:
  landing:
    tagline: "BioPlatform"
`;

describe("GET /api/i18n/config + /api/i18n/locales", () => {
  let server: Server;
  let baseUrl: string;

  const boot = (configFile: string) => {
    resetInstanceConfigForTests();
    loadInstanceConfig(configFile);
    const r = app.listen(0);
    server = r;
    return new Promise<void>((resolve) => r.on("listening", resolve)).then(() => {
      const addr = r.address();
      baseUrl = typeof addr === "object" && addr ? `http://127.0.0.1:${addr.port}` : "";
    });
  };

  after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  describe("i18n enabled", () => {
    before(() => boot(writeConfig(ENABLED_CONFIG)));

    test("/config mirrors public.i18n, including the master switch", async () => {
      const res = await fetch(`${baseUrl}/api/i18n/config`);
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.success, true);
      assert.deepEqual(body.data, {
        enabled: true,
        defaultLocale: "es",
        fallbackLocale: "en",
        locales: ["en", "es", "de"],
      });
      // Hot-reloadable config: the answer must never be cached.
      assert.match(String(res.headers.get("cache-control")), /no-store/);
    });

    test("/locales exposes the same set without the enabled flag", async () => {
      const res = await fetch(`${baseUrl}/api/i18n/locales`);
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.success, true);
      assert.deepEqual(body.data, {
        defaultLocale: "es",
        fallbackLocale: "en",
        locales: ["en", "es", "de"],
      });
      assert.equal(body.data.enabled, undefined);
      assert.match(String(res.headers.get("cache-control")), /no-store/);
    });

    test("GET /api/config carries the identical i18n block", async () => {
      const res = await fetch(`${baseUrl}/api/config`);
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.deepEqual(body.data.i18n, {
        enabled: true,
        defaultLocale: "es",
        fallbackLocale: "en",
        locales: ["en", "es", "de"],
      });
    });
  });

  describe("no i18n block (defaults)", () => {
    before(() => boot(writeConfig(DEFAULT_CONFIG)));

    test("a missing block is the inert default, answered 200 (not an error)", async () => {
      const res = await fetch(`${baseUrl}/api/i18n/config`);
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.deepEqual(body.data, {
        enabled: false,
        defaultLocale: "en",
        fallbackLocale: "en",
        locales: ["en", "es"],
      });
    });

    test("/locales returns the default locale set", async () => {
      const res = await fetch(`${baseUrl}/api/i18n/locales`);
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.deepEqual(body.data, {
        defaultLocale: "en",
        fallbackLocale: "en",
        locales: ["en", "es"],
      });
    });
  });
});
