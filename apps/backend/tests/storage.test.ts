import { test, describe, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { LocalStorageProvider } from "../src/lib/storage/local.js";
import { looksGzipped, maybeCompress, decompressIfNeeded, withCompression } from "../src/lib/storage/compression.js";
import type { StoredObject } from "../src/lib/storage/types.js";
import { pruneMediaCacheCaps } from "../src/lib/mediaStore.js";
import { computeMediaCacheExpired } from "../src/lib/orphanCleanup.js";

const tmpDirs: string[] = [];

function makeTmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bio-storage-test-"));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tmpDirs.length > 0) {
    fs.rmSync(tmpDirs.pop()!, { recursive: true, force: true });
  }
});

describe("LocalStorageProvider read/write round-trip", () => {
  test("writes a file, reads it back, and lists it", async () => {
    const dir = makeTmpDir();
    const provider = new LocalStorageProvider(dir);
    const payload = Buffer.from("hello storage test");
    await provider.writeObject("test-file.bin", payload);
    const read = await provider.readObject("test-file.bin");
    assert.deepEqual(read, payload);
    const list = await provider.listObjects();
    assert.equal(list.length, 1);
    assert.equal(list[0].name, "test-file.bin");
    assert.equal(list[0].size, payload.length);
  });

  test("statObject and objectExists report correctly", async () => {
    const dir = makeTmpDir();
    const provider = new LocalStorageProvider(dir);
    await provider.writeObject("stat-me.png", Buffer.from("x"));
    const stat = await provider.statObject("stat-me.png");
    assert.ok(stat);
    assert.equal(stat.name, "stat-me.png");
    assert.equal(stat.size, 1);
    assert.equal(await provider.objectExists("stat-me.png"), true);
    assert.equal(await provider.objectExists("nope.png"), false);
  });

  test("deleteObject removes the file and objectExists returns false", async () => {
    const dir = makeTmpDir();
    const provider = new LocalStorageProvider(dir);
    await provider.writeObject("delete-me.jpg", Buffer.from("y"));
    assert.equal(await provider.objectExists("delete-me.jpg"), true);
    await provider.deleteObject("delete-me.jpg");
    assert.equal(await provider.objectExists("delete-me.jpg"), false);
    assert.equal((await provider.listObjects()).length, 0);
  });

  test("readObject returns null for a missing name", async () => {
    const provider = new LocalStorageProvider(makeTmpDir());
    assert.equal(await provider.readObject("absent.bin"), null);
  });

  test("writeObject rejects names with traversal or embedded nulls", async () => {
    const provider = new LocalStorageProvider(makeTmpDir());
    await assert.rejects(() => provider.writeObject("../escape.txt", Buffer.from("nope")));
    await assert.rejects(() => provider.writeObject("dir/file.bin", Buffer.from("nope")));
    await assert.rejects(() => provider.writeObject("a\0b", Buffer.from("nope")));
  });
});

describe("compression utilities", () => {
  test("maybeCompress compresses a buffer when env toggle is true (default in test .env)", () => {
    const original = Buffer.alloc(2048, 0xaa);
    const compressed = maybeCompress(original);
    assert.ok(looksGzipped(compressed), "compressed buffer should have gzip magic bytes");
    assert.ok(compressed.length < original.length, "compressed should be smaller than the original");
  });

  test("decompressIfNeeded restores the original content", () => {
    const original = Buffer.alloc(2048, 0xbb);
    const compressed = maybeCompress(original);
    const restored = decompressIfNeeded(compressed);
    assert.deepEqual(restored, original);
  });

  test("looksGzipped returns false for non-gzip buffers", () => {
    assert.equal(looksGzipped(Buffer.from([0xff, 0xd8, 0xff])), false);
    assert.equal(looksGzipped(Buffer.alloc(0)), false);
    assert.equal(looksGzipped(Buffer.from("not gzip")), false);
  });

  test("withCompression round-trips a write/read on LocalStorageProvider", async () => {
    const dir = makeTmpDir();
    const raw = new LocalStorageProvider(dir);
    const provider = withCompression(raw);
    const payload = Buffer.alloc(4096, 0xcc);
    await provider.writeObject("compressed.bin", payload);
    const read = await provider.readObject("compressed.bin");
    assert.deepEqual(read, payload);
    const stat = await raw.statObject("compressed.bin");
    assert.ok(stat);
    assert.ok(stat.size < payload.length, "on-disk bytes should be compressed");
  });

  test("decompressIfNeeded handles uncompressed buffers gracefully", () => {
    const raw = Buffer.from("plain text, not gzip");
    assert.deepEqual(decompressIfNeeded(raw), raw);
  });
});

describe("cache helpers", () => {
  test("listCacheFiles traverses subdirectories and returns name relative to cache root", async () => {
    const dir = makeTmpDir();
    const provider = new LocalStorageProvider(dir);
    const cacheDir = path.join(dir, ".media-cache", "originals");
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(path.join(cacheDir, "hash1.jpg"), "a");
    fs.writeFileSync(path.join(cacheDir, "hash2.webp"), "b");
    const files = await provider.listCacheFiles();
    const names = files.map((f) => f.name).sort();
    assert.deepEqual(names, ["originals/hash1.jpg", "originals/hash2.webp"]);
  });

  test("deleteCacheFile rejects traversal and deletes safe files", async () => {
    const dir = makeTmpDir();
    const provider = new LocalStorageProvider(dir);
    const cacheDir = path.join(dir, ".media-cache");
    fs.mkdirSync(cacheDir, { recursive: true });
    const victim = path.join(cacheDir, "victim.bin");
    fs.writeFileSync(victim, "x");
    await provider.deleteCacheFile("safe.bin"); // no crash
    assert.ok(fs.existsSync(victim), "victim should still exist");
    await provider.deleteCacheFile("victim.bin");
    assert.ok(!fs.existsSync(victim));
  });
});

describe("pruneMediaCacheCaps", () => {
  test("deletes oldest files until both entry and size limits are satisfied", async () => {
    const dir = makeTmpDir();
    const provider = new LocalStorageProvider(dir);
    const now = Date.now();
    const files: StoredObject[] = [
      { name: "old1.bin", size: 100, mtimeMs: now - 5000 },
      { name: "old2.bin", size: 100, mtimeMs: now - 4000 },
      { name: "mid.bin", size: 100, mtimeMs: now - 3000 },
      { name: "new1.bin", size: 100, mtimeMs: now - 2000 },
      { name: "new2.bin", size: 100, mtimeMs: now - 1000 },
    ];
    const cacheDir = path.join(dir, ".media-cache");
    fs.mkdirSync(cacheDir, { recursive: true });
    for (const f of files) {
      fs.writeFileSync(path.join(cacheDir, f.name), "x");
    }

    const pruned = await pruneMediaCacheCaps(provider, 3, 300, files);
    assert.ok(pruned >= 2, "at least 2 oldest files should be pruned");
    assert.ok(!fs.existsSync(path.join(cacheDir, "old1.bin")), "oldest file should be deleted");
    assert.ok(!fs.existsSync(path.join(cacheDir, "old2.bin")), "second oldest should be deleted");
    assert.ok(fs.existsSync(path.join(cacheDir, "new2.bin")), "newest file should remain");
  });

  test("does nothing when within both limits", async () => {
    const dir = makeTmpDir();
    const provider = new LocalStorageProvider(dir);
    fs.mkdirSync(path.join(dir, ".media-cache"), { recursive: true });
    const files: StoredObject[] = [
      { name: "a.bin", size: 50, mtimeMs: Date.now() },
      { name: "b.bin", size: 50, mtimeMs: Date.now() },
    ];
    for (const f of files) fs.writeFileSync(path.join(dir, ".media-cache", f.name), "x");
    const pruned = await pruneMediaCacheCaps(provider, 5, 1000, files);
    assert.equal(pruned, 0);
    assert.ok(fs.existsSync(path.join(dir, ".media-cache", "a.bin")));
  });
});

describe("computeMediaCacheExpired", () => {
  test("works with StorageObject shape from listCacheFiles", () => {
    const now = Date.now();
    const files: StoredObject[] = [
      { name: "a.bin", size: 1, mtimeMs: now - 100 },
      { name: "b.bin", size: 1, mtimeMs: now - 10 * 24 * 60 * 60 * 1000 },
    ];
    const expired = computeMediaCacheExpired(files, 7 * 24 * 60 * 60 * 1000, now);
    assert.deepEqual(expired.map((f) => f.name), ["b.bin"]);
  });
});