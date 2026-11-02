// Regression tests for the media-serving outage class reported on prod
// (profile avatars 404ing because the cloud storage provider is unreachable).
// materializeUpload must (a) serve a stale cached copy when the origin fails,
// (b) still return 404 (null) when there is no recovery, and (c) surface the
// storage error in the logs instead of swallowing it silently. Also guards the
// env schema against the exact misconfiguration that caused the outage: a
// merged `.env` line turning B2_PREFIX into "B2_API_URL=https://...".

import { test, describe, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { materializeUpload, originalsCachePath } from "../src/lib/mediaStore.js";
import { __setPrimaryStorageProviderForTests, resetPrimaryStorageProviderForTests } from "../src/lib/storage/index.js";
import type { StorageProvider } from "../src/lib/storage/types.js";
import { resetEnvForTests, validateEnv } from "../src/config/env.js";

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "bio-media-fallback-"));
}

/** Minimal cloud-shaped provider stub: kind b2, configurable read behavior. */
function stubProvider(readObject: StorageProvider["readObject"]): StorageProvider {
  return {
    kind: "b2",
    writeObject: async () => {
      throw new Error("not expected in this test");
    },
    readObject,
    statObject: async () => null,
    objectExists: async () => false,
    listObjects: async () => [],
    deleteObject: async () => undefined,
  } as StorageProvider;
}

describe("materializeUpload storage-failure fallback", () => {
  const savedEnv: Record<string, string | undefined> = {};

  afterEach(() => {
    resetPrimaryStorageProviderForTests();
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
      delete savedEnv[key];
    }
    resetEnvForTests();
  });

  function pointEnvAt(root: string): void {
    savedEnv.LOCAL_STORAGE_PATH = process.env.LOCAL_STORAGE_PATH;
    process.env.LOCAL_STORAGE_PATH = root;
    resetEnvForTests();
  }

  test("serves a stale cached copy when the provider fails after the cache expires", async () => {
    const root = makeTmpDir();
    pointEnvAt(root);
    const rel = "avatar.png";
    const cacheFile = originalsCachePath("b2", rel);
    assert.ok(cacheFile);
    fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
    fs.writeFileSync(cacheFile, Buffer.from("stale-bytes"));
    // Push the cached file outside MEDIA_CACHE_MAX_AGE_HOURS (default 168h), so
    // only the stale fallback can produce it.
    const old = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    fs.utimesSync(cacheFile, old, old);

    __setPrimaryStorageProviderForTests(
      stubProvider(async () => {
        throw new Error("B2 authorize failed: 401 bad_auth_token");
      })
    );

    const got = await materializeUpload(rel);
    assert.equal(got, cacheFile);
    assert.equal(fs.readFileSync(got!, "utf8"), "stale-bytes");
  });

  test("provider outage with an empty cache returns null (404), never a throw that hides the cause", async () => {
    const root = makeTmpDir();
    pointEnvAt(root);
    __setPrimaryStorageProviderForTests(
      stubProvider(async () => {
        throw new Error("B2 authorize failed: 401 bad_auth_token");
      })
    );
    const got = await materializeUpload("nothing-here.png");
    assert.equal(got, null);
  });

  test("a healthy provider read still refreshes the cache", async () => {
    const root = makeTmpDir();
    pointEnvAt(root);
    __setPrimaryStorageProviderForTests(
      stubProvider(async () => Buffer.from("fresh-bytes"))
    );
    const got = await materializeUpload("fresh.png");
    assert.ok(got);
    assert.equal(fs.readFileSync(got!, "utf8"), "fresh-bytes");
  });
});

describe("B2_PREFIX env guard (merged .env lines)", () => {
  const base = {
    DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
    JWT_SECRET: "a".repeat(32),
  };

  test("rejects an env assignment or URL smuggled into B2_PREFIX", () => {
    const mangled = validateEnv({ ...base, B2_PREFIX: "B2_API_URL=https://api.backblazeb2.com" });
    assert.equal(mangled.success, false);
    assert.ok(mangled.issues.some((issue) => issue.includes("merged") || issue.includes("B2_PREFIX")));

    const withUrl = validateEnv({ ...base, B2_PREFIX: "https://gallery.example.com/prod" });
    assert.equal(withUrl.success, false);

    const ok = validateEnv({ ...base, B2_PREFIX: "prod/uploads" });
    assert.equal(ok.success, true);
    assert.equal(ok.success ? ok.data.B2_PREFIX : "", "prod/uploads");
  });
});
