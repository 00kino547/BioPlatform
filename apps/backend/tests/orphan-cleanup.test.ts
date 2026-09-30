import { test, describe, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  normalizeRef,
  collectReferenceNames,
  collectReferencedNames,
  computeOrphans,
  computeMediaCacheExpired,
} from "../src/lib/orphanCleanup.js";
import { prisma } from "../src/lib/prisma.js";
import { LocalStorageProvider } from "../src/lib/storage/local.js";
import { createStorageProvider } from "../src/lib/storage/index.js";
import type { StoredObject } from "../src/lib/storage/types.js";

const tmpDirs: string[] = [];

afterEach(() => {
  while (tmpDirs.length > 0) {
    const dir = tmpDirs.pop()!;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function makeTmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bio-orphan-"));
  tmpDirs.push(dir);
  return dir;
}

describe("normalizeRef", () => {
  test("accepts /uploads/<name> and uploads/<name>", () => {
    assert.equal(normalizeRef("/uploads/abc123.png"), "abc123.png");
    assert.equal(normalizeRef("uploads/abc123.png"), "abc123.png");
  });

  test("preserves subdirectories (product files) as storage-relative keys", () => {
    assert.equal(normalizeRef("/uploads/products/xyz.bin"), "products/xyz.bin");
    assert.equal(normalizeRef("uploads/products/xyz.bin"), "products/xyz.bin");
    assert.equal(normalizeRef("/uploads/sub/dir/abc.jpg"), "sub/dir/abc.jpg");
  });

  test("rejects external URLs, gradients, data URIs and protocol-relative", () => {
    assert.equal(normalizeRef("https://cdn.example.com/uploads/x.jpg"), null);
    assert.equal(normalizeRef("http://cdn.example.com/x.jpg"), null);
    assert.equal(normalizeRef("data:image/png;base64,AAA"), null);
    assert.equal(normalizeRef("//cdn.example.com/uploads/x.jpg"), null);
    assert.equal(normalizeRef("linear-gradient(135deg, #000, #fff)"), null);
  });

  test("rejects empty, traversal and non-uploads paths", () => {
    assert.equal(normalizeRef(null), null);
    assert.equal(normalizeRef(""), null);
    assert.equal(normalizeRef("../secret.txt"), null);
    assert.equal(normalizeRef("/etc/passwd"), null);
    assert.equal(normalizeRef("uploads/.."), null);
    assert.equal(normalizeRef("uploads/../evil.jpg"), null);
    assert.equal(normalizeRef("uploads/products/../evil.jpg"), null);
    assert.equal(normalizeRef("uploads/\0evil.jpg"), null);
    assert.equal(normalizeRef("C:/uploads/x.jpg"), null);
    assert.equal(normalizeRef("/uploads"), null);
  });
});

describe("collectReferenceNames", () => {
  test("dedupes and ignores non-upload refs", () => {
    const names = collectReferenceNames([
      "/uploads/a.png",
      "uploads/a.png",
      null,
      "https://x.test/b.png",
      "/uploads/c.webp",
      undefined,
    ]);
    assert.deepEqual([...names].sort(), ["a.png", "c.webp"]);
  });
});

describe("collectReferencedNames (DB-backed)", () => {
  let ids: string[] = [];

  afterEach(async () => {
    // Profile deletion cascades to slug namespaces, music tracks and products.
    await prisma.profile.deleteMany({ where: { id: { in: ids } } });
    await prisma.seasonalTheme.deleteMany({ where: { slug: { startsWith: "__orphan_test_" } } });
    await prisma.user.deleteMany({ where: { email: { startsWith: "orphan-test-" } } });
    await prisma.role.deleteMany({ where: { slug: { startsWith: "__orphan_test_" } } });
    ids = [];
  });

  test("collects avatar, banner, theme background, social link image, track and product refs", async () => {
    const role = await prisma.role.create({
      data: { name: "__orphan_test_role", slug: "__orphan_test_role", isSystem: false },
    });
    const user = await prisma.user.create({
      data: {
        username: `orphan_test_${Date.now()}`,
        email: `orphan-test-${Date.now()}@example.test`,
        passwordHash: "x",
        roleId: role.id,
      },
    });
    const profile = await prisma.profile.create({
      data: {
        userId: user.id,
        slug: `op_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
        isPrimary: true,
        avatar: "/uploads/avatar.png",
        banner: "/uploads/banner.jpg",
        theme: { backgroundImage: "/uploads/theme-bg.webp" },
        socialLinks: [
          { platform: "github", url: "https://github.com/me", image: "/uploads/link-icon.png" },
          { platform: "twitter", url: "https://x.com/me" },
        ],
      },
    });
    ids.push(profile.id);

    await prisma.seasonalTheme.create({
      data: {
        slug: `__orphan_test_${Date.now()}`,
        label: "__orphan_test",
        config: { backgroundImage: "/uploads/seasonal-bg.png" },
      },
    });
    await prisma.musicTrack.create({
      data: { profileId: profile.id, provider: "upload", filePath: "/uploads/track.mp3", position: 0 },
    });
    await prisma.product.create({
      data: {
        profileId: profile.id,
        title: "__orphan_test",
        priceCents: 100,
        filePath: "/uploads/products/product-file.zip",
        fileName: "product-file.zip",
        fileSize: 10,
        previewImage: "/uploads/preview.png",
      },
    });

    const names = await collectReferencedNames();
    assert.ok(names.has("avatar.png"), "profile avatar");
    assert.ok(names.has("banner.jpg"), "profile banner");
    assert.ok(names.has("theme-bg.webp"), "theme backgroundImage");
    assert.ok(names.has("link-icon.png"), "social link image");
    assert.ok(names.has("track.mp3"), "music track filePath");
    assert.ok(names.has("products/product-file.zip"), "product filePath (subdirectory key)");
    assert.ok(names.has("preview.png"), "product previewImage");
    assert.ok(names.has("seasonal-bg.png"), "seasonal theme backgroundImage");
  });
});

describe("computeOrphans", () => {
  const referenced = new Set(["keep.jpg", "fresh.jpg"]);
  const objects: StoredObject[] = [
    { name: "keep.jpg", size: 1, mtimeMs: 0 },
    { name: "fresh.jpg", size: 2, mtimeMs: Date.now() },
    { name: "old-orphan.png", size: 3, mtimeMs: Date.now() - 10 * 60 * 60 * 1000 },
    { name: "recent-orphan.png", size: 4, mtimeMs: Date.now() - 1000 },
  ];

  test("removes only unreferenced objects older than the grace period", () => {
    const orphans = computeOrphans(objects, referenced, 2 * 60 * 60 * 1000);
    assert.deepEqual(orphans.map((o) => o.name), ["old-orphan.png"]);
  });

  test("grace 0 removes every unreferenced object", () => {
    const orphans = computeOrphans(objects, new Set(["keep.jpg"]), 0);
    assert.deepEqual(orphans.map((o) => o.name).sort(), ["fresh.jpg", "old-orphan.png", "recent-orphan.png"]);
  });
});

describe("computeMediaCacheExpired", () => {
  test("keeps fresh, prunes older than maxAge", () => {
    const now = Date.now();
    const files: StoredObject[] = [
      { name: "a.webp", size: 1, mtimeMs: now - 100 },
      { name: "b.webp", size: 2, mtimeMs: now - 10 * 24 * 60 * 60 * 1000 },
    ];
    const expired = computeMediaCacheExpired(files, 7 * 24 * 60 * 60 * 1000, now);
    assert.deepEqual(expired.map((f) => f.name), ["b.webp"]);
  });
});

describe("LocalStorageProvider", () => {
  test("listObjects walks subdirectories recursively, skipping .media-cache", async () => {
    const dir = makeTmpDir();
    fs.writeFileSync(path.join(dir, "a.jpg"), "a");
    fs.writeFileSync(path.join(dir, "b.mp3"), "b");
    fs.mkdirSync(path.join(dir, ".media-cache"));
    fs.writeFileSync(path.join(dir, ".media-cache", "c.webp"), "c");
    fs.mkdirSync(path.join(dir, "products"));
    fs.writeFileSync(path.join(dir, "products", "d.bin"), "d");
    fs.mkdirSync(path.join(dir, "subdir"));
    fs.writeFileSync(path.join(dir, "subdir", "e.jpg"), "e");

    const provider = new LocalStorageProvider(dir);
    const objects = await provider.listObjects();
    assert.deepEqual(objects.map((o) => o.name).sort(), ["a.jpg", "b.mp3", "products/d.bin", "subdir/e.jpg"]);
  });

  test("resolveAbsolute allows subpaths but rejects traversal", () => {
    const provider = new LocalStorageProvider(makeTmpDir());
    assert.equal(provider.resolveAbsolute("../secret"), null);
    assert.equal(provider.resolveAbsolute("../../secret"), null);
    assert.equal(provider.resolveAbsolute("/etc/passwd"), null);
    assert.equal(provider.resolveAbsolute("sub/../secret"), null);
    assert.equal(provider.resolveAbsolute("sub//secret"), null);
    assert.notEqual(provider.resolveAbsolute("ok.jpg"), null);
    assert.notEqual(provider.resolveAbsolute("products/ok.bin"), null);
    assert.notEqual(provider.resolveAbsolute("sub/dir/ok.jpg"), null);
  });

  test("deleteObject rejects unsafe names and deletes safe ones (incl. subpaths)", async () => {
    const dir = makeTmpDir();
    const victim = path.join(dir, "orphan.png");
    fs.writeFileSync(victim, "x");
    fs.mkdirSync(path.join(dir, "products"));
    const productVictim = path.join(dir, "products", "orphan.bin");
    fs.writeFileSync(productVictim, "y");
    const provider = new LocalStorageProvider(dir);

    await provider.deleteObject("../secret.png");
    assert.ok(fs.existsSync(victim), "unsafe name must not delete");

    await provider.deleteObject("orphan.png");
    assert.ok(!fs.existsSync(victim), "safe root name must be deleted");

    await provider.deleteObject("products/orphan.bin");
    assert.ok(!fs.existsSync(productVictim), "safe subdirectory name must be deleted");
  });

  test("media cache helpers round-trip", async () => {
    const dir = makeTmpDir();
    fs.mkdirSync(path.join(dir, ".media-cache"));
    fs.writeFileSync(path.join(dir, ".media-cache", "hash.webp"), "x");
    const provider = new LocalStorageProvider(dir);
    const files = await provider.listMediaCache();
    assert.deepEqual(files.map((f) => f.name), ["hash.webp"]);
    await provider.deleteMediaCacheFile("hash.webp");
    assert.equal((await provider.listMediaCache()).length, 0);
  });
});

describe("createStorageProvider", () => {
  test("local is implemented", () => {
    const provider = createStorageProvider("local", os.tmpdir());
    assert.ok(provider);
    assert.equal(provider.kind, "local");
  });

  test("s3, r2 and b2 return compression-wrapped providers", () => {
    const warn = console.warn;
    console.warn = () => {};
    try {
      for (const kind of ["s3", "r2", "b2"]) {
        const provider = createStorageProvider(kind, os.tmpdir());
        assert.ok(provider, `createStorageProvider("${kind}") should not be null`);
        assert.equal(provider.kind, kind);
      }
    } finally {
      console.warn = warn;
    }
  });

  test("unknown providers return null", () => {
    assert.equal(createStorageProvider("gcs", os.tmpdir()), null);
  });
});