import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import type { Server } from "node:http";
import bcrypt from "bcrypt";
import app from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { POLICY_VERSIONS } from "../src/lib/newsletter.js";

// Admin → Moderation: the report queue, takedown, hash bans, disabled accounts,
// plus the deletion refactor that routes admin user-delete through
// deleteUserCompletely. The behaviour under test is the OPERATOR'S workflow, so
// reports/files are created directly and reviewed purely through the HTTP API.
describe("DMCA admin moderation", () => {
  let server: Server;
  let baseUrl: string;
  let modRoleId = "";
  let adminId = "";
  let accusedAId = "";
  let accusedBId = "";
  let adminToken = "";

  const PASSWORD = "dmca-mod-passw0rd";

  // Distinct 64-hex SHA-256 values. One per "content", shared across accounts
  // when a copy test needs the expansion to pull in another owner.
  const SHA_IMAGE_A = "aa".repeat(32);
  const SHA_IMAGE_B = "bb".repeat(32);
  const SHA_AUDIO = "cc".repeat(32);

  /** Field-stable view of the report rows this suite reads back. */
  interface ReportRow {
    id: string;
    status: string;
    claimantName: string;
    claimantEmail: string;
    workUrl: string;
    createdAt: string;
    handledAt: string | null;
    counterNoticeAt: string | null;
    filedBy: string | null;
    activeHashes: number;
  }

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
        // `av` is omitted on purpose: version checks are not what this suite
        // exercises, and the auth middleware accepts a missing av just fine.
        jwt.sign({ userId, purpose: "auth" }, getEnv().JWT_SECRET, { expiresIn: "1h" })
      )
    );
  }

  async function createUser(opts: {
    username: string;
    roleId: string;
    disabledAt?: Date | null;
  }) {
    return prisma.user.create({
      data: {
        username: opts.username,
        email: `${opts.username}@dmca-admin-mod.test`,
        emailVerified: true,
        emailVerifiedAt: new Date(),
        passwordHash: await bcrypt.hash(PASSWORD, 12),
        roleId: opts.roleId,
        disabledAt: opts.disabledAt ?? null,
        disabledReason: opts.disabledAt ? "dmca" : null,
        acceptedTosVersion: POLICY_VERSIONS.tos,
        acceptedPrivacyVersion: POLICY_VERSIONS.privacy,
        acceptedPoliciesAt: new Date(),
      },
    });
  }

  /** A stored fingerprint row for `user`, exactly as an upload would leave it. */
  async function fingerprint(user: { id: string; username: string }, opts: {
    sha256: string;
    filePath?: string;
    kind?: "AVATAR" | "SHOP_PRODUCT";
    pHashHex?: string | null;
    profileId?: string | null;
  }) {
    return prisma.mediaFile.create({
      data: {
        userId: user.id,
        profileId: opts.profileId ?? null,
        kind: opts.kind ?? "AVATAR",
        sha256: opts.sha256,
        pHashHex: opts.pHashHex ?? SHA_IMAGE_A,
        filePath: opts.filePath ?? `media/${user.username}.png`,
      },
    });
  }

  /** A report as a claimant would have filed it (attribution included). */
  async function fileReport(over: { filedByUserId?: string | null } = {}) {
    return prisma.dmcaReport.create({
      data: {
        claimantName: "Grace Hopper",
        claimantEmail: "grace@dmca-admin-mod.test",
        workUrl: "https://claimant.test/work",
        description: "Copy of my book.",
        infringingUrls: ["https://bio.test/something"],
        contactNote: "Filed through the API",
        filedByUserId: over.filedByUserId ?? null,
      },
    });
  }

  async function loginAs(token: string, path: string, init: RequestInit) {
    return request(path, { ...init, headers: auth(token) });
  }

  before(async () => {
    // Clean anything a previous run (or another DMCA suite sharing the chain)
    // left behind for this exact namespace.
    await prisma.user.deleteMany({ where: { email: { endsWith: "@dmca-admin-mod.test" } } });
    await prisma.role.deleteMany({ where: { slug: "dmca_mod_role" } });
    await prisma.authBan.deleteMany();
    await prisma.authLog.deleteMany();

    // The hash constants are the suite's own fixtures; a remediated run must
    // not inherit the previous run's bans (whose operator account is already
    // gone, nulling the audit columns via SET NULL).
    const fixtureShas = [SHA_IMAGE_A, SHA_IMAGE_B, SHA_AUDIO, `${SHA_IMAGE_A}ff`];
    await prisma.bannedHash.deleteMany({ where: { sha256: { in: fixtureShas } } });
    await prisma.dmcaReport.deleteMany({ where: { claimantEmail: { endsWith: "@dmca-admin-mod.test" } } });

    const modRole = await prisma.role.create({
      data: {
        name: "DMCA Moderator",
        slug: "dmca_mod_role",
        // Both a moderation permission and users.manage, because a moderator is
        // only that and nothing more — the test has to prove moderation.tier
        // does NOT imply the whole admin surface.
        permissions: ["moderation.manage", "users.manage"],
      },
    });
    modRoleId = modRole.id;

    // A user on the plain USER role: must NOT reach any /api/admin/dmca path.
    const plainRole = await prisma.role.create({
      data: { name: "Plain test user", slug: "dmca_mod_plain", permissions: [] },
    });
    try {
      await createUser({ username: "dmca_mod_plain", roleId: plainRole.id });
    } finally {
      // Kept only for the 403 case; the role itself stays alive for the suite.
    }

    const mod = await createUser({ username: "dmca_moderator", roleId: modRoleId });
    adminId = mod.id;
    const accusedA = await createUser({ username: "dmca_accused_a", roleId: modRoleId });
    const accusedB = await createUser({ username: "dmca_accused_b", roleId: modRoleId });
    accusedAId = accusedA.id;
    accusedBId = accusedB.id;

    adminToken = await signFor(adminId);

    server = app.listen(0);
    await once(server, "listening");
    baseUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  });

  after(async () => {
    server.close();
    await once(server, "close");
    await prisma.user.deleteMany({ where: { email: { endsWith: "@dmca-admin-mod.test" } } });
    await prisma.role.deleteMany({ where: { slug: { in: ["dmca_mod_role", "dmca_mod_plain"] } } });
  });

  test("a non-moderator is refused on the report queue", async () => {
    const plain = await prisma.user.findUnique({ where: { username: "dmca_mod_plain" } });
    assert.ok(plain);
    const res = await loginAs(await signFor(plain!.id), "/api/admin/dmca/reports", { method: "GET" });
    assert.equal(res.status, 403, JSON.stringify(res.body));
    // The auth+admin gate answers first (either copy: the router's own admin
    // gate, or the sub-router's permission gate — both are 403).
    assert.match(String(res.body.error), /access required|permissions/i);
  });

  test("reports list returns rows, status counts and pagination", async () => {
    const fresh = await fileReport();
    const seen = await fileReport();
    // A report the moderator reviewed: counts as DISMISSED, not NEW.
    await prisma.dmcaReport.update({
      where: { id: seen.id },
      data: { status: "DISMISSED", handledById: adminId, handledAt: new Date() },
    });

    const res = await loginAs(adminToken, "/api/admin/dmca/reports?q=dmca-admin-mod", { method: "GET" });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const reports = res.body.data as ReportRow[];
    const byId = (id: string) => reports.find((r) => r.id === id);
    assert.ok(byId(fresh.id), "the fresh report must be listed");

    const newRow = byId(fresh.id)!;
    assert.equal(newRow.status, "NEW");
    assert.equal(newRow.claimantName, "Grace Hopper");
    assert.equal(newRow.filedBy, null);
    assert.equal(newRow.activeHashes, 0);

    const seenRow = byId(seen.id)!;
    assert.equal(seenRow.status, "DISMISSED");
    assert.ok(seenRow.handledAt);

    const counts = res.body.counts as Record<string, number>;
    assert.ok(counts.NEW >= 1);
    assert.ok(counts.DISMISSED >= 1);
    assert.ok(counts.TAKEN_DOWN >= 0);

    const paged = await loginAs(adminToken, "/api/admin/dmca/reports?limit=1&offset=0", { method: "GET" });
    const pagination = paged.body.pagination as { total: number; limit: number; offset: number };
    assert.ok(pagination.total >= 2, "the whole queue, not just this page");
    assert.equal(pagination.limit, 1);

    const filtered = await loginAs(adminToken, "/api/admin/dmca/reports?status=NEW&q=dmca-admin-mod", { method: "GET" });
    const rows = filtered.body.data as ReportRow[];
    assert.ok(rows.every((r) => r.status === "NEW"), "status filter must be exclusive");
  });

  test("report detail exposes the operator record, not the public one", async () => {
    const report = await fileReport();
    await prisma.dmcaReport.update({
      where: { id: report.id },
      data: { decisionNote: "Looks <em>identical</em>.", counterNotice: "I own this." },
    });

    const res = await loginAs(adminToken, `/api/admin/dmca/reports/${report.id}`, { method: "GET" });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const detail = res.body.data as {
      status: string;
      description: string;
      decisionNote: string | null;
      counterNotice: string | null;
      infringingUrls: string[];
      hashes: unknown[];
    };
    assert.equal(detail.status, "NEW");
    assert.equal(detail.description, "Copy of my book.");
    assert.match(String(detail.decisionNote), /identical/);
    assert.equal(detail.counterNotice, "I own this.");
    assert.ok(Array.isArray(detail.hashes));

    const missing = await loginAs(adminToken, "/api/admin/dmca/reports/00000000-0000-0000-0000-000000000000", { method: "GET" });
    assert.equal(missing.status, 404);
  });

  test("dismissing a report records the decision and sanitizes the note", async () => {
    const report = await fileReport();
    const res = await loginAs(adminToken, `/api/admin/dmca/reports/${report.id}/dismiss`, {
      method: "POST",
      body: JSON.stringify({ note: "No match: <script>alert(1)</script> the work is different." }),
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));

    const stored = await prisma.dmcaReport.findUnique({ where: { id: report.id } });
    assert.equal(stored!.status, "DISMISSED");
    assert.equal(stored!.handledById, adminId);
    assert.ok(stored!.handledAt);
    assert.ok(!stored!.decisionNote!.includes("<script>"), "operator notes are sanitized");
    assert.ok(!stored!.decisionNote!.includes("<"), "no HTML-like characters survive");

    // A takedown cannot be dismissed afterwards.
    await prisma.dmcaReport.update({ where: { id: report.id }, data: { status: "TAKEN_DOWN" } });
    const again = await loginAs(adminToken, `/api/admin/dmca/reports/${report.id}/dismiss`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    assert.equal(again.status, 400, JSON.stringify(again.body));
  });

  test("takedown removes every copy, bans the hash, disables the owners", async () => {
    // accused A owns the reported avatar; accused B holds a byte-identical copy.
    const profileA = await prisma.profile.create({
      data: {
        userId: accusedAId,
        slug: `dmca_accused_a_profile_${Date.now()}`,
        isPrimary: true,
        avatar: "media/dmca_accused_a.png",
      },
    });
    const fileA = await fingerprint(
      { id: accusedAId, username: "dmca_accused_a" },
      { sha256: SHA_IMAGE_A, filePath: "media/dmca_accused_a.png", profileId: profileA.id }
    );
    const fileB = await fingerprint(
      { id: accusedBId, username: "dmca_accused_b" },
      { sha256: SHA_IMAGE_A, filePath: "media/dmca_accused_b.png" }
    );
    assert.ok(fileB.id, "the byte-identical twin is its own media record");
    const report = await fileReport();

    const res = await loginAs(adminToken, `/api/admin/dmca/reports/${report.id}/takedown`, {
      method: "POST",
      body: JSON.stringify({ mediaFileIds: [fileA.id], note: "Confirmed infringement" }),
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const result = res.body.data as { filesRemoved: number; hashesBanned: number; accountsDisabled: string[] };
    assert.equal(result.filesRemoved, 2); // fileA and the byte-identical fileB
    assert.equal(result.hashesBanned, 1); // one distinct sha256
    assert.deepEqual(
      [...result.accountsDisabled].sort(),
      [accusedAId, accusedBId].sort(),
      "both owners must be disabled"
    );

    // Live copies are gone — the reported one and the other account's twin.
    const remain = await prisma.mediaFile.count({ where: { sha256: SHA_IMAGE_A } });
    assert.equal(remain, 0, "every copy of the same bytes must be removed");

    // The avatar reference on the reported profile is cleared, not dangling.
    const profileNow = await prisma.profile.findUnique({ where: { id: profileA.id } });
    assert.equal(profileNow!.avatar, null);

    // A permanent ban is registered and provenanced to this report + operator.
    const [ban] = await prisma.bannedHash.findMany({ where: { sha256: SHA_IMAGE_A } });
    assert.ok(ban, "an active ban must exist");
    assert.equal(ban.dmcaReportId, report.id);
    assert.equal(ban.bannedById, adminId);
    assert.equal(ban.unbannedAt, null);

    // Both owners are locked down for the appeal flow.
    const [accusedA, accusedB] = await Promise.all([
      prisma.user.findUnique({ where: { id: accusedAId } }),
      prisma.user.findUnique({ where: { id: accusedBId } }),
    ]);
    assert.ok(accusedA!.disabledAt);
    assert.equal(accusedA!.disabledReason, "dmca");
    assert.ok(accusedB!.disabledAt);

    // The report adopts the decision.
    const adopted = await prisma.dmcaReport.findUnique({ where: { id: report.id } });
    assert.equal(adopted!.status, "TAKEN_DOWN");
    assert.equal(adopted!.handledById, adminId);
    assert.equal(adopted!.decisionNote, "Confirmed infringement");
  });

  test("counter-notice lifts the report's hash bans but never auto-reactivates", async () => {
    // A second infringement on the exact same bytes would have happened before
    // the ban existed; recreate the pair cleanly to prove the counter-notice
    // path, including a second copy that must NOT be re-removed (it is gone).
    const report = await fileReport();
    await prisma.bannedHash.create({
      data: { sha256: SHA_AUDIO, reason: "dmca", dmcaReportId: report.id, bannedById: adminId },
    });

    const res = await loginAs(adminToken, `/api/admin/dmca/reports/${report.id}/counter-notice`, {
      method: "POST",
      body: JSON.stringify({ text: "This is my original recording, no infringement." }),
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));

    const stored = await prisma.dmcaReport.findUnique({ where: { id: report.id } });
    assert.equal(stored!.status, "COUNTER_NOTICE");
    assert.ok(stored!.counterNoticeAt);

    const [ban] = await prisma.bannedHash.findMany({ where: { sha256: SHA_AUDIO } });
    assert.ok(ban.unbannedAt, "the ban is lifted");
    assert.equal(ban.unbannedById, adminId);

    // Deliberate asymmetry: the report's TARGET accounts stay disabled.
    const fromEarlier = await prisma.user.findUnique({ where: { id: accusedAId } });
    assert.ok(fromEarlier!.disabledAt, "reactivation stays an explicit operator decision");

    const missing = await loginAs(adminToken, `/api/admin/dmca/reports/${report.id}/counter-notice`, {
      method: "POST",
      body: JSON.stringify({ text: "" }),
    });
    assert.equal(missing.status, 400, JSON.stringify(missing.body));
  });

  test("deleting a report lifts its bans first, then removes the row", async () => {
    const report = await fileReport();
    await prisma.bannedHash.create({
      data: { sha256: SHA_IMAGE_B, reason: "dmca", dmcaReportId: report.id, bannedById: adminId },
    });

    const res = await loginAs(adminToken, `/api/admin/dmca/reports/${report.id}`, { method: "DELETE" });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.deepEqual(res.body.data, { hashesUnbanned: 1 });

    // Row gone; the ban survives as *history* but is no longer active or linked.
    const reportNow = await prisma.dmcaReport.findUnique({ where: { id: report.id } });
    assert.equal(reportNow, null);
    const [ban] = await prisma.bannedHash.findMany({ where: { sha256: SHA_IMAGE_B } });
    assert.ok(ban, "unbanning takes the ban with it — never a DELETE of the ban");
    assert.ok(ban!.unbannedAt);
    assert.equal(ban!.dmcaReportId, null, "the ban outlives the report, detached");

    // Deleting it a second time reports the row as gone.
    const again = await loginAs(adminToken, `/api/admin/dmca/reports/${report.id}`, { method: "DELETE" });
    assert.equal(again.status, 400, JSON.stringify(again.body));
    assert.match(String(again.body.error), /not found/i);
  });

  test("media search finds copies across accounts and flags bans", async () => {
    // accused A (post-counter-notice, still disabled) and a fresh account both
    // hold SHA_IMAGE_A-less bytes: use a new fixture identity to avoid collision
    // with the takedown above.
    const holder = await createUser({ username: "dmca_mod_holder", roleId: modRoleId });
    await fingerprint({ id: accusedBId, username: "dmca_accused_b" }, { sha256: SHA_IMAGE_B, filePath: "media/search-b.png" });
    await fingerprint({ id: holder.id, username: "dmca_mod_holder" }, { sha256: SHA_IMAGE_B, filePath: "media/search-bb.png" });
    // A banned hash shows up in the search with the flag set.
    await prisma.bannedHash.create({
      data: { sha256: SHA_IMAGE_B, reason: "dmca", bannedById: adminId },
    });

    const res = await loginAs(adminToken, `/api/admin/dmca/media?sha256=${SHA_IMAGE_B}`, { method: "GET" });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const rows = res.body.data as Array<{
      sha256: string;
      owner: { userId: string; username: string };
      copyOwners: string[];
      copyCount: number;
      banned: boolean;
      kind: string;
      profileSlug: string | null;
    }>;
    assert.equal(rows.length, 2, "both accounts holding the same bytes");
    const owners = new Set(rows.flatMap((r) => r.copyOwners));
    assert.ok(owners.has("dmca_accused_b") && owners.has("dmca_mod_holder"));
    assert.ok(rows.every((r) => r.copyCount === 2));
    assert.ok(rows.every((r) => r.banned === true), "an active ban must be surfaced");

    // Kind + username filters narrow the same dataset.
    const byUser = await loginAs(adminToken, `/api/admin/dmca/media?username=dmca_mod_holder`, { method: "GET" });
    const userRows = byUser.body.data as Array<{ owner: { username: string } }>;
    assert.ok(userRows.every((r) => r.owner.username === "dmca_mod_holder"));

    const badKind = await loginAs(adminToken, `/api/admin/dmca/media?kind=NONSENSE`, { method: "GET" });
    assert.equal(badKind.status, 400);

    await prisma.user.delete({ where: { id: holder.id } }).catch(() => undefined);
  });

  test("manual unbans expose history and refuse a second lift", async () => {
    const creation = await prisma.bannedHash.create({
      data: { sha256: SHA_IMAGE_A + "ff", reason: "dmca", bannedById: adminId },
    });

    const list = await loginAs(adminToken, "/api/admin/dmca/hashes?active=true", { method: "GET" });
    const active = list.body.data as Array<{ id: string; active: boolean; unbannedAt: string | null }>;
    assert.ok(active.some((h) => h.id === creation.id && h.active === true));

    const res = await loginAs(adminToken, `/api/admin/dmca/hashes/${creation.id}`, { method: "DELETE" });
    assert.equal(res.status, 200, JSON.stringify(res.body));

    const lifted = await prisma.bannedHash.findUnique({ where: { id: creation.id } });
    assert.ok(lifted!.unbannedAt);
    assert.equal(lifted!.unbannedById, adminId);

    const second = await loginAs(adminToken, `/api/admin/dmca/hashes/${creation.id}`, { method: "DELETE" });
    assert.equal(second.status, 409, JSON.stringify(second.body));

    const missing = await loginAs(adminToken, "/api/admin/dmca/hashes/00000000-0000-0000-0000-000000000000", { method: "DELETE" });
    assert.equal(missing.status, 404);
  });

  test("the disabled queue lists audit fields and reactivates on demand", async () => {
    // A disabled account that also FILED a report: the queue must show both.
    await prisma.user.update({
      where: { id: accusedBId },
      data: { appealText: "I did not do this.", appealSubmittedAt: new Date() },
    });

    const res = await loginAs(adminToken, "/api/admin/dmca/disabled", { method: "GET" });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const rows = res.body.data as Array<{
      id: string;
      username: string;
      disabledReason: string | null;
      disabledAt: string;
      appealSubmittedAt: string | null;
      reportsFiled: number;
    }>;
    const rowFor = (id: string) => rows.find((r) => r.id === id);
    assert.ok(rowFor(accusedAId), "accused A is disabled and must appear");
    const a = rowFor(accusedAId)!;
    assert.equal(a.disabledReason, "dmca");
    assert.ok(a.disabledAt, "the queue row must include when the account was disabled");

    const react = await loginAs(adminToken, `/api/admin/dmca/disabled/${accusedAId}/reactivate`, {
      method: "POST",
      body: JSON.stringify({ decision: "Counter-notice upheld after review" }),
    });
    assert.equal(react.status, 200, JSON.stringify(react.body));

    const after = await prisma.user.findUnique({ where: { id: accusedAId } });
    assert.equal(after!.disabledAt, null);
    assert.equal(after!.disabledReason, null);
    assert.equal(after!.appealDecision, "Counter-notice upheld after review");
    assert.ok(after!.appealReviewedAt);

    const notDisabled = await loginAs(adminToken, "/api/admin/dmca/disabled/00000000-0000-0000-0000-000000000000/reactivate", {
      method: "POST",
      body: JSON.stringify({ decision: "x" }),
    });
    assert.equal(notDisabled.status, 404, JSON.stringify(notDisabled.body));
  });

  test("admin user delete goes through the shared deletion path", async () => {
    const victim = await createUser({ username: "dmca_mod_victim", roleId: modRoleId });
    const victimProfile = await prisma.profile.create({
      data: { userId: victim.id, slug: `dmca_mod_victim_${Date.now()}`, isPrimary: true },
    });
    await fingerprint(
      { id: victim.id, username: "dmca_mod_victim" },
      { sha256: SHA_IMAGE_A + "ab", filePath: "media/victim.png" }
    );
    // A report the victim filed: a legal record that must survive its author.
    const victimReport = await prisma.dmcaReport.create({
      data: {
        claimantName: "Victim",
        claimantEmail: `${victim.username}@dmca-admin-mod.test`,
        workUrl: "https://claimant.test/x",
        description: "filed before deletion",
        infringingUrls: ["https://bio.test/victim"],
        filedByUserId: victim.id,
      },
    });

    const res = await loginAs(adminToken, `/api/admin/users/${victim.id}`, { method: "DELETE" });
    assert.equal(res.status, 200, JSON.stringify(res.body));

    // The account is fully gone…
    const goneUser = await prisma.user.findUnique({ where: { id: victim.id } });
    assert.equal(goneUser, null);
    const goneProfile = await prisma.profile.findUnique({ where: { id: victimProfile.id } });
    assert.equal(goneProfile, null);
    const goneFingerprint = await prisma.mediaFile.count({ where: { userId: victim.id } });
    assert.equal(goneFingerprint, 0);

    // …and its DMCA records detached, never deleted.
    const surviving = await prisma.dmcaReport.findUnique({ where: { id: victimReport.id } });
    assert.ok(surviving, "the report outlives the filer");
    assert.equal(surviving!.filedByUserId, null);

    // Self-deletion stays guarded before the shared routine runs.
    const self = await loginAs(adminToken, `/api/admin/users/${adminId}`, { method: "DELETE" });
    assert.equal(self.status, 400, JSON.stringify(self.body));
    assert.match(String(self.body.error), /own account/i);
  });
});