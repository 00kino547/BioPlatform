import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import type { Server } from "node:http";
import bcrypt from "bcrypt";
import app from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { POLICY_VERSIONS } from "../src/lib/newsletter.js";

// Admin → Moderation: REPORT-LESS operator actions. Everything here happens
// without a filed DMCA report — direct takedown, direct hash ban, single-file
// delete, whole-profile takedown and standalone account disable. The logic is
// shared with the report flow (lib/dmca.ts), so these tests pin the parts that
// differ: no report row, accounts off by default, and the 409 conflicts.
describe("Manual (report-less) moderation", () => {
  let server: Server;
  let baseUrl: string;
  let modRoleId = "";
  let adminId = "";
  let adminToken = "";

  const PASSWORD = "dmca-manual-passw0rd";

  // Distinct 64-hex SHA-256 values; each lives on its own pHash (or none) so an
  // expansion cannot accidentally pull in another fixture.
  const SHA_X = "11".repeat(32);
  const SHA_Y = "22".repeat(32);
  const SHA_Z = "33".repeat(32);
  const SHA_W = "44".repeat(32);
  const SHA_BAN = "ab".repeat(32);

  async function request(path: string, init: RequestInit = {}) {
    const res = await fetch(`${baseUrl}${path}`, init);
    const body = (await res.json().catch(() => null)) ?? {};
    return { status: res.status, body: body as Record<string, unknown> };
  }

  function auth(token: string): Record<string, string> {
    return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  }

  function signFor(userId: string): Promise<string> {
    return import("jsonwebtoken").then(({ default: jwt }) =>
      import("../src/config/env.js").then(({ getEnv }) =>
        jwt.sign({ userId, purpose: "auth" }, getEnv().JWT_SECRET, { expiresIn: "1h" })
      )
    );
  }

  async function createUser(username: string, roleId: string) {
    return prisma.user.create({
      data: {
        username,
        email: `${username}@dmca-manual.test`,
        emailVerified: true,
        emailVerifiedAt: new Date(),
        passwordHash: await bcrypt.hash(PASSWORD, 12),
        roleId,
        acceptedTosVersion: POLICY_VERSIONS.tos,
        acceptedPrivacyVersion: POLICY_VERSIONS.privacy,
        acceptedPoliciesAt: new Date(),
      },
    });
  }

  async function fingerprint(
    userId: string,
    opts: { sha256: string; filePath: string; pHashHex?: string | null; profileId?: string | null; kind?: "AVATAR" | "SHOP_PRODUCT" }
  ) {
    return prisma.mediaFile.create({
      data: {
        userId,
        profileId: opts.profileId ?? null,
        kind: opts.kind ?? "AVATAR",
        sha256: opts.sha256,
        pHashHex: opts.pHashHex ?? null,
        filePath: opts.filePath,
      },
    });
  }

  function post(path: string, body: unknown) {
    return request(path, { method: "POST", headers: auth(adminToken), body: JSON.stringify(body) });
  }

  before(async () => {
    const fixtureShas = [SHA_X, SHA_Y, SHA_Z, SHA_W, SHA_BAN];
    await prisma.user.deleteMany({ where: { email: { endsWith: "@dmca-manual.test" } } });
    await prisma.role.deleteMany({ where: { slug: { in: ["dmca_manual_role", "dmca_manual_plain"] } } });
    await prisma.bannedHash.deleteMany({ where: { sha256: { in: fixtureShas } } });

    const modRole = await prisma.role.create({
      data: { name: "Manual Moderator", slug: "dmca_manual_role", permissions: ["moderation.manage"] },
    });
    modRoleId = modRole.id;

    const plainRole = await prisma.role.create({
      data: { name: "Manual plain user", slug: "dmca_manual_plain", permissions: [] },
    });
    await createUser("dmca_manual_plain", plainRole.id);

    const admin = await createUser("dmca_manual_admin", modRoleId);
    adminId = admin.id;
    adminToken = await signFor(adminId);

    server = app.listen(0);
    await once(server, "listening");
    baseUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  });

  after(async () => {
    server.close();
    await once(server, "close");
    await prisma.bannedHash.deleteMany({ where: { sha256: { in: [SHA_X, SHA_Y, SHA_Z, SHA_W, SHA_BAN] } } });
    await prisma.user.deleteMany({ where: { email: { endsWith: "@dmca-manual.test" } } });
    await prisma.role.deleteMany({ where: { slug: { in: ["dmca_manual_role", "dmca_manual_plain"] } } });
  });

  test("a non-moderator is refused on the manual endpoints", async () => {
    const plain = await prisma.user.findUnique({ where: { username: "dmca_manual_plain" } });
    const token = await signFor(plain!.id);
    const res = await request("/api/admin/dmca/takedown", {
      method: "POST",
      headers: auth(token),
      body: JSON.stringify({ mediaFileIds: ["x"] }),
    });
    assert.equal(res.status, 403, JSON.stringify(res.body));
  });

  test("report-less takedown removes copies, bans the hash, leaves accounts on by default", async () => {
    const ownerA = await createUser("dmca_manual_owner_a", modRoleId);
    const ownerB = await createUser("dmca_manual_owner_b", modRoleId);
    const fileA = await fingerprint(ownerA.id, { sha256: SHA_X, filePath: "media/manual-a.png" });
    await fingerprint(ownerB.id, { sha256: SHA_X, filePath: "media/manual-b.png" });

    const res = await post("/api/admin/dmca/takedown", {
      mediaFileIds: [fileA.id],
      note: "Manual removal <script>alert(1)</script>",
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const result = res.body.data as { filesRemoved: number; hashesBanned: number; accountsDisabled: string[] };
    assert.equal(result.filesRemoved, 2, "both byte-identical copies go");
    assert.equal(result.hashesBanned, 1);
    assert.deepEqual(result.accountsDisabled, [], "accounts stay enabled unless asked");

    const remaining = await prisma.mediaFile.count({ where: { sha256: SHA_X } });
    assert.equal(remaining, 0);

    const [ban] = await prisma.bannedHash.findMany({ where: { sha256: SHA_X } });
    assert.ok(ban, "a manual ban is registered");
    assert.equal(ban.dmcaReportId, null, "no report behind a manual takedown");
    assert.equal(ban.bannedById, adminId);
    assert.ok(!ban.reason.includes("<"), "the note is sanitized before storage");

    const [a, b] = await Promise.all([
      prisma.user.findUnique({ where: { id: ownerA.id } }),
      prisma.user.findUnique({ where: { id: ownerB.id } }),
    ]);
    assert.equal(a!.disabledAt, null);
    assert.equal(b!.disabledAt, null);
  });

  test("report-less takedown disables owners only with disableAccount:true", async () => {
    const owner = await createUser("dmca_manual_owner_c", modRoleId);
    const file = await fingerprint(owner.id, { sha256: SHA_Y, filePath: "media/manual-c.png" });

    const res = await post("/api/admin/dmca/takedown", {
      mediaFileIds: [file.id],
      note: "Repeat offender",
      disableAccount: true,
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const result = res.body.data as { accountsDisabled: string[] };
    assert.deepEqual(result.accountsDisabled, [owner.id]);

    const after = await prisma.user.findUnique({ where: { id: owner.id } });
    assert.ok(after!.disabledAt);
    assert.equal(after!.disabledReason, "Repeat offender", "the reason reaches the disabled queue");

    // Clean up the disable so later assertions on this same account stay simple.
    await prisma.user.update({ where: { id: owner.id }, data: { disabledAt: null, disabledReason: null } });
  });

  test("report-less takedown rejects an empty selection", async () => {
    const res = await post("/api/admin/dmca/takedown", { mediaFileIds: [] });
    assert.equal(res.status, 400, JSON.stringify(res.body));
  });

  test("a hash can be banned directly, and duplicates are refused", async () => {
    const res = await post("/api/admin/dmca/hashes", {
      sha256: SHA_BAN,
      pHashHex: "0123456789ABCDEF",
      note: "Pre-emptive <b>block</b>",
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    const created = res.body.data as { id: string };
    assert.ok(created.id);

    const stored = await prisma.bannedHash.findUnique({ where: { id: created.id } });
    assert.equal(stored!.sha256, SHA_BAN);
    assert.equal(stored!.pHashHex, "0123456789abcdef", "the pHash is normalized to lower case");
    assert.equal(stored!.dmcaReportId, null);
    assert.equal(stored!.bannedById, adminId);
    assert.ok(!stored!.reason.includes("<"));

    const dup = await post("/api/admin/dmca/hashes", { sha256: SHA_BAN });
    assert.equal(dup.status, 409, JSON.stringify(dup.body));

    const badSha = await post("/api/admin/dmca/hashes", { sha256: "not-a-hash" });
    assert.equal(badSha.status, 400, JSON.stringify(badSha.body));

    const badPhash = await post("/api/admin/dmca/hashes", { sha256: SHA_W, pHashHex: "abc" });
    assert.equal(badPhash.status, 400, JSON.stringify(badPhash.body));
  });

  test("a single file can be deleted without banning its hash", async () => {
    const owner = await createUser("dmca_manual_owner_d", modRoleId);
    const file = await fingerprint(owner.id, { sha256: SHA_Z, filePath: "media/manual-d.png" });

    const res = await request(`/api/admin/dmca/media/${file.id}`, { method: "DELETE", headers: auth(adminToken) });
    assert.equal(res.status, 200, JSON.stringify(res.body));

    const gone = await prisma.mediaFile.findUnique({ where: { id: file.id } });
    assert.equal(gone, null);
    const bans = await prisma.bannedHash.count({ where: { sha256: SHA_Z } });
    assert.equal(bans, 0, "a single-file delete never blocks the bytes");

    const missing = await request("/api/admin/dmca/media/00000000-0000-0000-0000-000000000000", {
      method: "DELETE",
      headers: auth(adminToken),
    });
    assert.equal(missing.status, 404);
  });

  test("a whole profile's media can be taken down by slug", async () => {
    const owner = await createUser("dmca_manual_owner_e", modRoleId);
    const slug = `dmca-manual-profile-${Date.now()}`;
    const profile = await prisma.profile.create({
      data: { userId: owner.id, slug, isPrimary: true, avatar: "media/manual-e.png" },
    });
    await fingerprint(owner.id, {
      sha256: SHA_W,
      filePath: "media/manual-e.png",
      profileId: profile.id,
    });

    const res = await post(`/api/admin/dmca/profiles/${slug}/takedown`, { note: "Whole profile" });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const result = res.body.data as { filesRemoved: number; hashesBanned: number };
    assert.equal(result.filesRemoved, 1);
    assert.equal(result.hashesBanned, 1);

    const profileNow = await prisma.profile.findUnique({ where: { id: profile.id } });
    assert.equal(profileNow!.avatar, null, "the profile reference is cleared, not dangling");
    assert.equal(await prisma.mediaFile.count({ where: { userId: owner.id } }), 0);

    const [ban] = await prisma.bannedHash.findMany({ where: { sha256: SHA_W } });
    assert.ok(ban);
    assert.equal(ban.dmcaReportId, null);

    const missing = await post("/api/admin/dmca/profiles/does-not-exist/takedown", {});
    assert.equal(missing.status, 404);
  });

  test("an account can be disabled directly and refuses a second disable", async () => {
    const target = await createUser("dmca_manual_target", modRoleId);

    const res = await post(`/api/admin/dmca/users/${target.username}/disable`, { reason: "Abuse outside DMCA" });
    assert.equal(res.status, 200, JSON.stringify(res.body));

    const after = await prisma.user.findUnique({ where: { id: target.id } });
    assert.ok(after!.disabledAt);
    assert.equal(after!.disabledReason, "Abuse outside DMCA");

    const again = await post(`/api/admin/dmca/users/${target.id}/disable`, { reason: "again" });
    assert.equal(again.status, 409, JSON.stringify(again.body));

    const missing = await post("/api/admin/dmca/users/ghost-user/disable", { reason: "x" });
    assert.equal(missing.status, 404);

    const noReason = await post(`/api/admin/dmca/users/${target.username}/disable`, {});
    assert.equal(noReason.status, 400, JSON.stringify(noReason.body));
  });
});
