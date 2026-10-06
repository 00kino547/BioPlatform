import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma.js";
import {
  parseAbuseWhitelistRule,
  ipMatchesRule,
  isIpAbuseWhitelisted,
  addAbuseWhitelistEntry,
  removeAbuseWhitelistEntry,
  loadAbuseWhitelist,
  ABUSE_WHITELIST_SETTING_KEY,
} from "../src/lib/antiAbuseWhitelist.js";
import { detectInviteAbuse, sha256, type ClaimFingerprint } from "../src/lib/affiliateService.js";
import { fingerprintBlock } from "../src/lib/authGuard.js";
import { POLICY_VERSIONS } from "../src/lib/newsletter.js";

async function resetWhitelist() {
  await prisma.systemSetting.deleteMany({ where: { key: ABUSE_WHITELIST_SETTING_KEY } });
}

describe("abuse whitelist rule parsing", () => {
  test("parses exact IPv4 and CIDR networks", () => {
    const exact = parseAbuseWhitelistRule("203.0.113.7");
    assert.deepEqual(exact, { family: 4, value: (203n << 24n) | (0n << 16n) | (113n << 8n) | 7n, prefix: 32 });
    const cidr = parseAbuseWhitelistRule("192.168.1.0/24");
    assert.equal(cidr?.family, 4);
    assert.equal(cidr?.prefix, 24);
  });

  test("parses IPv6 exact and CIDR", () => {
    const exact = parseAbuseWhitelistRule("2001:db8::1");
    assert.equal(exact?.family, 6);
    assert.equal(exact?.prefix, 128);
    const cidr = parseAbuseWhitelistRule("2001:db8::/32");
    assert.equal(cidr?.family, 6);
    assert.equal(cidr?.prefix, 32);
  });

  test("rejects garbage, bad prefixes and empty strings", () => {
    assert.equal(parseAbuseWhitelistRule("not-an-ip"), null);
    assert.equal(parseAbuseWhitelistRule("1.2.3.4/33"), null);
    assert.equal(parseAbuseWhitelistRule("1.2.3.4/"), null);
    assert.equal(parseAbuseWhitelistRule(""), null);
    assert.equal(parseAbuseWhitelistRule("   "), null);
    assert.equal(parseAbuseWhitelistRule("300.1.1.1"), null);
  });
});

describe("abuse whitelist rule matching", () => {
  const cidr24 = parseAbuseWhitelistRule("203.0.113.0/24")!;
  const v6every64 = parseAbuseWhitelistRule("2001:db8::/64")!;

  test("exact IPv4 matches and CIDR covers a host on the network", () => {
    assert.equal(ipMatchesRule(parseAbuseWhitelistRule("203.0.113.7")!, "203.0.113.7"), true);
    assert.equal(ipMatchesRule(parseAbuseWhitelistRule("203.0.113.7")!, "203.0.113.8"), false);
    assert.equal(ipMatchesRule(cidr24, "203.0.113.200"), true);
    assert.equal(ipMatchesRule(cidr24, "203.0.114.1"), false);
  });

  test("IPv4-mapped IPv6 matches an IPv4 rule", () => {
    assert.equal(ipMatchesRule(cidr24, "::ffff:203.0.113.5"), true);
  });

  test("IPv6 CIDR covers hosts on the network", () => {
    assert.equal(ipMatchesRule(v6every64, "2001:db8::1234"), true);
    assert.equal(ipMatchesRule(v6every64, "2001:db8:1::1"), false);
  });

  test("mixing address families never matches", () => {
    assert.equal(ipMatchesRule(cidr24, "2001:db8::1"), false);
  });
});

describe("abuse whitelist store (DB-backed)", () => {
  before(resetWhitelist);
  after(resetWhitelist);

  test("add persists via SystemSetting and survives a reload", async () => {
    const added = await addAbuseWhitelistEntry({
      value: "203.0.113.0/24",
      note: "beta testers <script>",
      createdBy: "admin",
    });
    assert.equal(added.value, "203.0.113.0/24");
    assert.equal(added.note, "beta testers script");
    const loaded = await loadAbuseWhitelist();
    assert.equal(loaded.length, 1);
    assert.equal(loaded[0].id, added.id);
    assert.equal(loaded[0].note, "beta testers script");
  });

  test("isIpAbuseWhitelisted matches stored networks", async () => {
    assert.equal(await isIpAbuseWhitelisted("203.0.113.42"), true);
    assert.equal(await isIpAbuseWhitelisted("203.0.114.1"), false);
    assert.equal(await isIpAbuseWhitelisted(""), false);
  });

  test("duplicate values and invalid input are rejected", async () => {
    await assert.rejects(
      () => addAbuseWhitelistEntry({ value: "203.0.113.0/24", createdBy: "admin" }),
      /already whitelisted/
    );
    await assert.rejects(
      () => addAbuseWhitelistEntry({ value: "banana", createdBy: "admin" }),
      /valid IP address/
    );
  });

  test("remove deletes by id and returns false for unknowns", async () => {
    const added = await addAbuseWhitelistEntry({ value: "198.51.100.1", createdBy: "admin" });
    assert.equal(await removeAbuseWhitelistEntry("missing-id"), false);
    assert.equal(await removeAbuseWhitelistEntry(added.id), true);
    assert.equal(await isIpAbuseWhitelisted("198.51.100.1"), false);
  });

  test("corrupt stored JSON degrades to an empty list", async () => {
    await prisma.systemSetting.upsert({
      where: { key: ABUSE_WHITELIST_SETTING_KEY },
      update: { value: "{not-json" },
      create: { key: ABUSE_WHITELIST_SETTING_KEY, value: "{not-json" },
    });
    assert.deepEqual(await loadAbuseWhitelist(), []);
  });
});

describe("whitelist bypasses anti-abuse guards (DB-backed)", () => {
  let role: { id: string };
  const testIp = "198.51.100.44";
  const fp: ClaimFingerprint = { ip: testIp, cookie: sha256("wl-device-cookie"), userAgent: "Mozilla/5.0 WhitelistBypass/1.0" };

  before(async () => {
    await prisma.authBan.deleteMany({ where: { kind: "IP", value: testIp } });
    await prisma.affiliateReward.deleteMany();
    await prisma.inviteCode.deleteMany();
    await prisma.user.deleteMany();
    await prisma.role.deleteMany();
    await resetWhitelist();
    const r = await prisma.role.create({
      data: { name: "Whitelist Test", slug: "whitelist_test", permissions: [] },
    });
    role = { id: r.id };
  });

  after(async () => {
    await prisma.authBan.deleteMany({ where: { kind: "IP", value: testIp } });
    await prisma.affiliateReward.deleteMany();
    await prisma.inviteCode.deleteMany();
    await prisma.user.deleteMany();
    await prisma.role.deleteMany();
    await resetWhitelist();
  });

  async function mkUser(username: string, referredBy?: string) {
    const user = await prisma.user.create({
      data: {
        acceptedTosVersion: POLICY_VERSIONS.tos,
        acceptedPrivacyVersion: POLICY_VERSIONS.privacy,
        acceptedPoliciesAt: new Date(),
        username,
        email: `${username}@whitelist-test.local`,
        passwordHash: "not-a-real-hash",
        roleId: role.id,
        registeredIp: testIp,
        registeredFingerprint: fp.cookie,
        registeredUserAgentHash: sha256(fp.userAgent),
      },
    });
    if (referredBy) {
      await prisma.user.update({ where: { id: user.id }, data: { referredById: referredBy } });
    }
    return user;
  }

  test("detectInviteAbuse flags the fingerprint, then honors the allowlist", async () => {
    const referrer = await mkUser("wl_referrer");
    const member = await mkUser("wl_member", referrer.id);

    const before = await detectInviteAbuse(prisma, fp, referrer.id);
    assert.equal(before?.reason, "referral");

    await addAbuseWhitelistEntry({ value: testIp, createdBy: "test" });
    const after = await detectInviteAbuse(prisma, fp, referrer.id);
    assert.equal(after, null);

    await prisma.user.deleteMany({ where: { id: { in: [member.id, referrer.id] } } });
  });

  test("fingerprintBlock honors the allowlist for login lockouts", async () => {
    await resetWhitelist();
    await prisma.authBan.create({ data: { kind: "IP", value: testIp, permanent: true, failCount: 5 } });
    const fpInput = { ip: testIp, cookie: fp.cookie, userAgent: fp.userAgent };

    await addAbuseWhitelistEntry({ value: testIp, createdBy: "test" });
    assert.equal(await fingerprintBlock(fpInput), null);

    await removeAbuseWhitelistEntry((await loadAbuseWhitelist())[0].id);
    const blocked = await fingerprintBlock(fpInput);
    assert.notEqual(blocked, null);
    assert.equal(blocked?.permanent, true);
  });

  test("empty whitelist leaves detectInviteAbuse active", async () => {
    await resetWhitelist();
    const referrer = await mkUser("wl_referrer_2");
    const member = await mkUser("wl_member_2", referrer.id);
    const hit = await detectInviteAbuse(prisma, fp, referrer.id);
    assert.equal(hit?.reason, "referral");
    await prisma.user.deleteMany({ where: { id: { in: [member.id, referrer.id] } } });
  });
});