import { test, describe, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { B2StorageProvider, createB2StorageProvider } from "../src/lib/storage/b2.js";
import { withCompression } from "../src/lib/storage/compression.js";
import type { StorageProvider } from "../src/lib/storage/types.js";

interface MockFile {
  fileName: string;
  fileId: string;
  bytes: Buffer;
  contentType: string;
  contentLength: number;
  action: string;
  uploadTimestamp: number;
}

interface MockBucket {
  bucketName: string;
  bucketId: string;
  files: Map<string, MockFile>;
}

function installMockB2(): {
  buckets: Map<string, MockBucket>;
  restore: () => void;
  seq: () => number;
  revoke: (upTo: number) => void;
} {
  const buckets = new Map<string, MockBucket>();
  let tokenCount = 0;
  let fileSeq = 0;
  let revokedUpTo = 0;

  function tokenSeq(token: string): number {
    const match = /^token-(\d+)$/.exec(token);
    return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
  }

  function bucketFromName(name: string): MockBucket | undefined {
    for (const bucket of buckets.values()) {
      if (bucket.bucketName === name) return bucket;
    }
    return undefined;
  }

  function ensureBucket(bucketName: string): MockBucket {
    const existing = bucketFromName(bucketName);
    if (existing) return existing;
    const bucket: MockBucket = {
      bucketName,
      bucketId: `bucket-${buckets.size + 1}`,
      files: new Map(),
    };
    buckets.set(bucket.bucketId, bucket);
    return bucket;
  }

  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });

  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const method = init?.method ?? "GET";
    const u = new URL(url);

    if (u.pathname.endsWith("/b2api/v3/b2_authorize_account")) {
      const auth = init?.headers?.["Authorization"];
      assert.ok(String(auth).startsWith("Basic "), "authorize must use Basic auth");
      tokenCount += 1;
      return json(200, {
        accountId: "account-1",
        authorizationToken: `token-${tokenCount}`,
        apiUrl: "http://mock-b2/api",
        downloadUrl: "http://mock-b2/download",
      });
    }

    const authHeader = String(init?.headers?.["Authorization"] ?? "");
    if (!authHeader.startsWith("token-") && !authHeader.startsWith("upload-token-")) {
      return json(401, { code: "bad_auth_token", message: "unauthorized", status: 401 });
    }
    // Simulate Backblaze's auth-token expiry: once `revoke(n)` is called, any
    // account token issued at or before seq n is rejected as expired until the
    // provider re-authorizes.
    if (authHeader.startsWith("token-") && tokenSeq(authHeader) <= revokedUpTo) {
      return json(401, { code: "expired_auth_token", message: "expired_auth_token", status: 401 });
    }

    let body: Record<string, unknown> = {};
    if (init?.body) {
      const text = new TextDecoder().decode(bodyToBuffer(init.body));
      if (text) {
        try {
          body = JSON.parse(text) as Record<string, unknown>;
        } catch {
          // binary upload body
        }
      }
    }

    if (u.pathname.endsWith("/b2_list_buckets")) {
      const rows = [...buckets.values()].map((b) => ({ bucketId: b.bucketId, bucketName: b.bucketName }));
      return json(200, { buckets: rows });
    }

    if (u.pathname.endsWith("/b2_create_bucket")) {
      const bucket = ensureBucket(body.bucketName!);
      return json(200, { bucketId: bucket.bucketId, bucketName: bucket.bucketName });
    }

    if (u.pathname.endsWith("/b2_get_upload_url")) {
      const bucket = buckets.get(body.bucketId);
      if (!bucket) return json(400, { code: "bad_bucket_id", message: "invalid bucket", status: 400 });
      return json(200, {
        uploadUrl: "http://mock-b2/upload",
        authorizationToken: `upload-token-${tokenCount}`,
      });
    }

    if (u.pathname.endsWith("/b2_list_file_names")) {
      const bucket = buckets.get(body.bucketId);
      if (!bucket) return json(400, { code: "bad_bucket_id", message: "invalid bucket", status: 400 });
      const prefix = body.prefix ?? "";
      const startFileName = body.startFileName ?? "";
      const limit = body.maxFileCount ?? 100;
      const sorted = [...bucket.files.values()]
        .filter((file) => file.fileName.startsWith(prefix))
        .filter((file) => !startFileName || file.fileName > startFileName)
        .sort((a, b) => (a.fileName < b.fileName ? -1 : a.fileName > b.fileName ? 1 : 0));
      const page = sorted.slice(0, limit);
      const files = page.map((file) => ({
        fileName: file.fileName,
        fileId: file.fileId,
        action: file.action,
        contentLength: file.contentLength,
        uploadTimestamp: file.uploadTimestamp,
      }));
      const next = sorted.length > limit ? sorted[limit].fileName : null;
      return json(200, { files, nextFileName: next ?? undefined });
    }

    if (u.pathname.endsWith("/b2_delete_file_version")) {
      for (const bucket of buckets.values()) {
        if (bucket.files.get(body.fileName)?.fileId === body.fileId) {
          bucket.files.delete(body.fileName);
        }
      }
      return json(200, { fileName: body.fileName, fileId: body.fileId });
    }

    if (u.pathname === "/upload") {
      const fileName = decodeURIComponent(String(init?.headers?.["X-Bz-File-Name"] ?? ""));
      const sha1 = String(init?.headers?.["X-Bz-Content-Sha1"] ?? "");
      const contentType = String(init?.headers?.["X-Bz-Content-Type"] ?? "application/octet-stream");
      const bytes = bodyToBuffer(init?.body);
      fileSeq += 1;
      for (const bucket of buckets.values()) {
        if (!bucket.files.has(fileName)) continue;
        bucket.files.get(fileName)!.bytes = bytes;
        bucket.files.get(fileName)!.contentLength = bytes.length;
        bucket.files.get(fileName)!.contentType = contentType;
        bucket.files.get(fileName)!.action = "upload";
        const expected = createHash("sha1").update(bytes).digest("hex");
        assert.equal(sha1, expected, "uploaded sha1 should match the payload");
        return json(200, {});
      }
      // file not seen yet: created by this upload — place it under the first bucket
      const target = buckets.values().next().value;
      const file: MockFile = {
        fileName,
        fileId: `file-${fileSeq}`,
        bytes,
        contentType,
        contentLength: bytes.length,
        action: "upload",
        uploadTimestamp: Date.now(),
      };
      target.files.set(fileName, file);
      const expected = createHash("sha1").update(bytes).digest("hex");
      assert.equal(sha1, expected, "uploaded sha1 should match the payload");
      return json(200, {});
    }

    const fileMatch = u.pathname.match(/^\/download\/file\/([^/]+)\/(.+)$/);
    if (fileMatch) {
      const bucketName = decodeURIComponent(fileMatch[1]);
      const fileName = decodeURIComponent(fileMatch[2]);
      const bucket = bucketFromName(bucketName);
      const file = bucket?.files.get(fileName);
      if (!file) return new Response(null, { status: 404 });
      return new Response(file.bytes, {
        status: 200,
        headers: { "Content-Type": file.contentType, "Content-Length": String(file.contentLength) },
      });
    }

    return json(404, { code: "not_found", message: `no mock route for ${method} ${u.pathname}`, status: 404 });
  }) as typeof fetch;

  return {
    buckets,
    restore: () => {
      globalThis.fetch = originalFetch;
    },
    seq: () => tokenCount,
    revoke: (upTo: number) => {
      revokedUpTo = Math.max(revokedUpTo, upTo);
    },
  };
}

function bodyToBuffer(body: BodyInit | undefined | null): Buffer {
  if (body == null) return Buffer.alloc(0);
  if (body instanceof ArrayBuffer) return Buffer.from(body);
  if (ArrayBuffer.isView(body)) return Buffer.from(body.buffer, body.byteOffset, body.byteLength);
  if (typeof body === "string") return Buffer.from(body);
  return Buffer.alloc(0);
}

const mocks: Array<() => void> = [];

afterEach(() => {
  while (mocks.length > 0) {
    mocks.pop()!();
  }
});

function provider(config?: Partial<ConstructorParameters<typeof B2StorageProvider>[0]>): StorageProvider {
  const mock = installMockB2();
  mocks.push(mock.restore);
  return createB2StorageProvider({
    kind: "b2",
    applicationKeyId: "key-id",
    applicationKey: "app-key",
    bucket: "my-bucket",
    prefix: undefined,
    ...config,
  });
}

describe("B2StorageProvider", () => {
  test("writeObject + readObject round-trip returns exact bytes", async () => {
    const p = provider();
    const payload = Buffer.from("hello b2 native storage");
    await p.writeObject("file.txt", payload, { contentType: "text/plain" });
    const read = await p.readObject("file.txt");
    assert.deepEqual(read, payload);
    const missing = await p.readObject("nope.txt");
    assert.equal(missing, null);
  });

  test("objectExists/statObject reflect written objects and ignore missing ones", async () => {
    const p = provider();
    assert.equal(await p.objectExists("a.txt"), false);
    await p.writeObject("a.txt", Buffer.from("aaa"));
    assert.equal(await p.objectExists("a.txt"), true);
    const stat = await p.statObject("a.txt");
    assert.ok(stat);
    assert.equal(stat.name, "a.txt");
    assert.equal(stat.size, 3);
    assert.ok(stat.mtimeMs > 0);
    assert.equal(await p.statObject("absent.txt"), null);
  });

  test("listObjects enumerates written files", async () => {
    const p = provider();
    await p.writeObject("x.png", Buffer.from([0x89, 0x50]));
    await p.writeObject("y.png", Buffer.from([0x89, 0x51]));
    const list = await p.listObjects();
    const names = list.map((o) => o.name).sort();
    assert.deepEqual(names, ["x.png", "y.png"]);
  });

  test("deleteObject removes the object", async () => {
    const p = provider();
    await p.writeObject("tmp.jpg", Buffer.from("jpeg"));
    assert.equal(await p.objectExists("tmp.jpg"), true);
    await p.deleteObject("tmp.jpg");
    assert.equal(await p.objectExists("tmp.jpg"), false);
    await p.deleteObject("already-gone.jpg");
  });

  test("prefix scopes keys and unkeys listings", async () => {
    const mock = installMockB2();
    mocks.push(mock.restore);
    const p = createB2StorageProvider({
      kind: "b2",
      applicationKeyId: "key-id",
      applicationKey: "app-key",
      bucket: "my-bucket",
      prefix: "user/1",
    });
    await p.writeObject("avatar.png", Buffer.from("avatar"));
    const delegated = createB2StorageProvider({
      kind: "b2",
      applicationKeyId: "key-id",
      applicationKey: "app-key",
      bucket: "my-bucket",
      prefix: "user/1",
    });
    assert.equal(await delegated.objectExists("avatar.png"), true);
    const list = await delegated.listObjects();
    assert.deepEqual(list.map((o) => o.name), ["avatar.png"]);
  });

  test("withCompression wrapper round-trips through the b2 provider", async () => {
    const mock = installMockB2();
    mocks.push(mock.restore);
    const raw: StorageProvider = createB2StorageProvider({
      kind: "b2",
      applicationKeyId: "key-id",
      applicationKey: "app-key",
      bucket: "my-bucket",
    });
    const p = withCompression(raw);
    const payload = Buffer.alloc(4096, 0xaa);
    await p.writeObject("big.bin", payload, { contentType: "application/octet-stream" });
    const read = await p.readObject("big.bin");
    assert.deepEqual(read, payload);
    const rawRead = await raw.readObject("big.bin");
    assert.ok(rawRead && rawRead.length < payload.length, "object should be compressed at rest");
  });

  test("bucket is auto-created when missing", async () => {
    const p = provider();
    await p.writeObject("first.bin", Buffer.from("data"));
    assert.equal(await p.objectExists("first.bin"), true);
  });

  test("re-authorizes and retries when the account token expires", async () => {
    const mock = installMockB2();
    mocks.push(mock.restore);
    const p = new B2StorageProvider({
      kind: "b2",
      applicationKeyId: "key-id",
      applicationKey: "app-key",
      bucket: "my-bucket",
    });
    const payload = Buffer.from("survives token rotation");

    // Establish a valid session (cached token), then revoke it server-side to
    // emulate Backblaze's ~24h auth-token expiry mid-process.
    await p.writeObject("rot.txt", payload, { contentType: "text/plain" });
    assert.deepEqual(await p.readObject("rot.txt"), payload);
    const issuedBeforeRevoke = mock.seq();
    mock.revoke(issuedBeforeRevoke);

    // A subsequent operation must transparently re-authorize and succeed.
    assert.deepEqual(await p.readObject("rot.txt"), payload);
    await p.writeObject("rot2.txt", Buffer.from("second write"));
    assert.deepEqual(await p.readObject("rot2.txt"), Buffer.from("second write"));
    // A re-authorization happened after the revoke above (token count grew).
    assert.ok(mock.seq() > issuedBeforeRevoke, "provider should have re-authorized");
  });

  test("missing credentials fail on first operation", async () => {
    const mock = installMockB2();
    mocks.push(mock.restore);
    const p = new B2StorageProvider({
      kind: "b2",
      applicationKeyId: "",
      applicationKey: "",
      bucket: "b",
    });
    await assert.rejects(() => p.writeObject("x.bin", Buffer.from("x")), /B2_APPLICATION_KEY_ID/);
  });
});