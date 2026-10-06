import { test, describe, before, after } from "node:test";
import { POLICY_VERSIONS } from "../src/lib/newsletter.js";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import jwt from "jsonwebtoken";
import app from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { getEnv } from "../src/config/env.js";
import {
  parseAffiliateLevels,
  discountLevels,
  allowanceLevels,
  badgeLevels,
  sha256,
  fingerprintHashes,
  detectInviteAbuse,
  type ClaimFingerprint,
} from "../src/lib/affiliateService.js";

describe("parseAffiliateLevels", () => {
  test("parses count:value pairs, sorted, ignoring invalid entries", () => {
    const levels = parseAffiliateLevels(" 4:badge-x , 2:10 , junk , 5:, :7 , 1:5 ");
    assert.deepEqual(levels, [
      { level: 1, value: "5" },
      { level: 2, value: "10" },
      { level: 4, value: "badge-x" },
    ]);
  });

  test("returns empty array for empty or whitespace input", () => {
    assert.deepEqual(parseAffiliateLevels(""), []);
    assert.deepEqual(parseAffiliateLevels("   "), []);
  });
});

describe("milestone parsing helpers", () => {
  test("env level getters mirror parseAffiliateLevels", () => {
    assert.deepEqual(discountLevels(), parseAffiliateLevels(""));
    assert.deepEqual(allowanceLevels(), parseAffiliateLevels(""));
    assert.deepEqual(badgeLevels(), parseAffiliateLevels(""));
  });
});

describe("affiliate anti-abuse fingerprinting", () => {
  test("fingerprintHashes produces stable cookie + user-agent hashes", () => {
    const fp = fingerprintHashes({ ip: "1.2.3.4", cookie: "cookie-hash", userAgent: "Chrome/1" });
    assert.equal(fp.ip, "1.2.3.4");
    assert.equal(fp.cookie, "cookie-hash");
    assert.equal(fp.userAgentHash, sha256("Chrome/1"));
    assert.equal(fp.userAgentHash.length, 64);
    assert.notEqual(fingerprintHashes({ ip: "x", cookie: "c", userAgent: "A" }).userAgentHash, fingerprintHashes({ ip: "x", cookie: "c", userAgent: "B" }).userAgentHash);
  });
});

describe("detectInviteAbuse (DB-backed)", () => {
  let role: { id: string };
  let referrerId: string;
  const cookie = sha256("device-cookie-1");
  const ua = "Mozilla/5.0 AbuseTest/1.0";
  const fp: ClaimFingerprint = { ip: "203.0.113.99", cookie, userAgent: ua };
  const otherFp: ClaimFingerprint = { ip: "198.51.100.42", cookie: sha256("other-device"), userAgent: "Mozilla/5.0 Other/2.0" };

  async function mkUser(username: string, opts: { referredBy?: string | null; usedInvite?: boolean; fp?: ClaimFingerprint } = {}) {
    const fprint = opts.fp ?? otherFp;
    const user = await prisma.user.create({
      data: {
        acceptedTosVersion: POLICY_VERSIONS.tos,
        acceptedPrivacyVersion: POLICY_VERSIONS.privacy,
        acceptedPoliciesAt: new Date(),
        username,
        email: `${username}@test.local`,
        passwordHash: "not-a-real-hash",
        roleId: role.id,
        registeredIp: fprint.ip,
        registeredFingerprint: fprint.cookie,
        registeredUserAgentHash: sha256(fprint.userAgent),
      },
    });
    if (opts.referredBy) {
      await prisma.user.update({ where: { id: user.id }, data: { referredById: opts.referredBy } });
    }
    if (opts.usedInvite) {
      await prisma.inviteCode.create({
        data: {
          code: `abuse-${randomUUID().slice(0, 12)}`,
          createdById: user.id,
          usedById: user.id,
          usedAt: new Date(),
        },
      });
    }
    return user;
  }

  before(async () => {
    await prisma.affiliateReward.deleteMany();
    await prisma.inviteCode.deleteMany();
    await prisma.user.deleteMany();
    await prisma.role.deleteMany();
    const r = await prisma.role.create({
      data: { name: "Abuse Test", slug: "abuse_test", permissions: [] },
    });
    role = { id: r.id };
    referrerId = (await mkUser("abuse_referrer")).id;
  });

  after(async () => {
    await prisma.affiliateReward.deleteMany();
    await prisma.inviteCode.deleteMany();
    await prisma.user.deleteMany();
    await prisma.role.deleteMany();
  });

  test("returns null when no previous claim matches the fingerprint", async () => {
    const hit = await detectInviteAbuse(prisma, otherFp, referrerId);
    assert.equal(hit, null);
  });

  function cleanupUser(id: string): Promise<void> {
    return prisma.$transaction([
      prisma.inviteCode.deleteMany({ where: { OR: [{ createdById: id }, { usedById: id }] } }),
      prisma.user.delete({ where: { id } }),
    ]).then(() => undefined);
  }

  test("detects a same-fingerprint referral to the same referrer", async () => {
    const ref = await mkUser("abuse_referral_a", { referredBy: referrerId, fp });
    const hit = await detectInviteAbuse(prisma, fp, referrerId);
    assert.equal(hit?.reason, "referral");
    assert.notEqual(hit, null);
    await cleanupUser(ref.id);
  });

  test("does not flag a different fingerprint for the same referrer", async () => {
    const ref = await mkUser("abuse_referral_b", { referredBy: referrerId, fp });
    const hit = await detectInviteAbuse(prisma, otherFp, referrerId);
    assert.equal(hit, null);
    await cleanupUser(ref.id);
  });

  test("detects repeated invite consumption from the same fingerprint", async () => {
    const usr = await mkUser("abuse_invite_a", { usedInvite: true, fp });
    const hit = await detectInviteAbuse(prisma, fp, null);
    assert.equal(hit?.reason, "invite");
    await cleanupUser(usr.id);
  });

  test("does not flag a fresh fingerprint when another device consumed an invite", async () => {
    const offender = await mkUser("abuse_invite_c", { usedInvite: true, fp });
    const fresh = await mkUser("abuse_invite_d", { fp: otherFp });
    const hit = await detectInviteAbuse(prisma, otherFp, null);
    assert.equal(hit, null);
    await cleanupUser(offender.id);
    await cleanupUser(fresh.id);
  });

  test("ignores empty fingerprints", async () => {
    const hit = await detectInviteAbuse(prisma, { ip: "", cookie: "", userAgent: "" }, referrerId);
    assert.equal(hit, null);
  });
});

describe("affiliate milestone config (service)", () => {
  before(async () => {
    await prisma.systemSetting.deleteMany({ where: { key: "affiliate.milestones" } });
  });

  after(async () => {
    await prisma.systemSetting.deleteMany({ where: { key: "affiliate.milestones" } });
  });

  test("falls back to env defaults when no DB setting exists", async () => {
    const { source, config } = await import("../src/lib/affiliateService.js").then((m) => m.effectiveMilestoneConfig());
    assert.equal(source, "env");
    assert.deepEqual(config.discountLevels, discountLevels());
    assert.deepEqual(config.allowanceLevels, allowanceLevels());
    assert.deepEqual(config.badgeLevels, badgeLevels());
  });

  test("setAffiliateMilestones stores a DB override", async () => {
    const { setAffiliateMilestones, effectiveMilestoneConfig } = await import("../src/lib/affiliateService.js");
    await setAffiliateMilestones({
      discountLevels: [{ level: 2, value: "15" }],
      allowanceLevels: [{ level: 5, value: "2" }],
      badgeLevels: [],
    });
    const { source, config } = await effectiveMilestoneConfig();
    assert.equal(source, "db");
    assert.deepEqual(config.discountLevels, [{ level: 2, value: "15" }]);
    assert.deepEqual(config.allowanceLevels, [{ level: 5, value: "2" }]);
    assert.deepEqual(config.badgeLevels, []);
  });

  test("resetAffiliateMilestones clears the DB override", async () => {
    const { setAffiliateMilestones, resetAffiliateMilestones, effectiveMilestoneConfig } = await import("../src/lib/affiliateService.js");
    await setAffiliateMilestones({ discountLevels: [{ level: 1, value: "5" }], allowanceLevels: [], badgeLevels: [] });
    await resetAffiliateMilestones();
    const { source } = await effectiveMilestoneConfig();
    assert.equal(source, "env");
  });

  test("setAffiliateMilestones stores invitee discount config, resolveInviteeConfig reflects it", async () => {
    const { setAffiliateMilestones, effectiveMilestoneConfig, resolveInviteeConfig } = await import("../src/lib/affiliateService.js");
    const env = getEnv();
    await setAffiliateMilestones({ discountLevels: [], allowanceLevels: [], badgeLevels: [], inviteeDiscountPercent: 25, discountDurationDays: 60 });
    const { config } = await effectiveMilestoneConfig();
    assert.equal(config.inviteeDiscountPercent, 25);
    assert.equal(config.discountDurationDays, 60);
    const resolved = resolveInviteeConfig(config);
    assert.equal(resolved.inviteeDiscountPercent, 25);
    assert.equal(resolved.discountDurationDays, 60);
    assert.notEqual(env.AFFILIATE_INVITEE_DISCOUNT_PERCENT, 25);
  });

  test("invitee config falls back to env defaults when the DB override omits it", async () => {
    const { setAffiliateMilestones, effectiveMilestoneConfig, resolveInviteeConfig } = await import("../src/lib/affiliateService.js");
    const env = getEnv();
    await setAffiliateMilestones({ discountLevels: [{ level: 2, value: "10" }], allowanceLevels: [], badgeLevels: [] });
    const { config } = await effectiveMilestoneConfig();
    const resolved = resolveInviteeConfig(config);
    assert.equal(resolved.inviteeDiscountPercent, env.AFFILIATE_INVITEE_DISCOUNT_PERCENT);
    assert.equal(resolved.discountDurationDays, env.AFFILIATE_DISCOUNT_DURATION_DAYS);
  });
});

describe("affiliate milestone config (HTTP)", () => {
  let server: Server;
  let baseUrl: string;
  let roleId: string;
  let userId: string;

  function signAuth(id: string): string {
    return jwt.sign({ userId: id, purpose: "auth" }, getEnv().JWT_SECRET, { expiresIn: "7d" });
  }

  async function request(path: string, init: RequestInit = {}): Promise<{ status: number; body: Record<string, unknown>; headers: Headers }> {
    const res = await fetch(`${baseUrl}${path}`, init);
    const body = await res.json().catch(() => null);
    return { status: res.status, body, headers: res.headers };
  }

  before(async () => {
    await prisma.systemSetting.deleteMany({ where: { key: "affiliate.milestones" } });
    const role = await prisma.role.create({
      data: { name: "Affiliate Admin", slug: "affiliate_admin_http", permissions: ["affiliates.manage"] },
    });
    roleId = role.id;
    const u = await prisma.user.create({
      data: {
        acceptedTosVersion: POLICY_VERSIONS.tos,
        acceptedPrivacyVersion: POLICY_VERSIONS.privacy,
        acceptedPoliciesAt: new Date(),
        username: "aff_admin_http",
        email: "aff_admin_http@test.local",
        passwordHash: "not-a-real-hash",
        roleId,
      },
    });
    userId = u.id;
    const r = app.listen(0);
    await new Promise<void>((resolve) => r.on("listening", resolve));
    server = r;
    const addr = r.address();
    baseUrl = typeof addr === "object" && addr ? `http://127.0.0.1:${addr.port}` : "";
  });

  after(async () => {
    await prisma.systemSetting.deleteMany({ where: { key: "affiliate.milestones" } });
    await prisma.user.deleteMany({ where: { roleId } });
    await prisma.role.delete({ where: { id: roleId } });
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  test("PUT /api/affiliate/admin/config stores a DB override", async () => {
    const { status, body } = await request("/api/affiliate/admin/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${signAuth(userId)}` },
      body: JSON.stringify({ discountLevels: [{ level: 3, value: "20" }], allowanceLevels: [], badgeLevels: [] }),
    });
    assert.equal(status, 200, JSON.stringify(body));
    assert.equal(body.success, true);
    assert.equal((body.data as Record<string, unknown>).configSource, "db");
  });

  test("GET /api/affiliate/admin/overview reflects the DB override", async () => {
    const { status, body } = await request("/api/affiliate/admin/overview", {
      headers: { Authorization: `Bearer ${signAuth(userId)}` },
    });
    assert.equal(status, 200, JSON.stringify(body));
    assert.equal((body.data as Record<string, unknown>).configSource, "db");
    const cfg = (body.data as Record<string, unknown>).config as Record<string, unknown>;
    assert.deepEqual(cfg.discountLevels, [{ level: 3, value: "20" }]);
  });

  test("PUT accepts invitee discount config and overview returns it", async () => {
    const put = await request("/api/affiliate/admin/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${signAuth(userId)}` },
      body: JSON.stringify({ discountLevels: [], allowanceLevels: [], badgeLevels: [], inviteeDiscountPercent: 15, discountDurationDays: 30 }),
    });
    assert.equal(put.status, 200, JSON.stringify(put.body));
    const putCfg = (put.body.data as Record<string, unknown>).config as Record<string, unknown>;
    assert.equal(putCfg.inviteeDiscountPercent, 15);
    assert.equal(putCfg.discountDurationDays, 30);

    const overview = await request("/api/affiliate/admin/overview", {
      headers: { Authorization: `Bearer ${signAuth(userId)}` },
    });
    const cfg = (overview.body.data as Record<string, unknown>).config as Record<string, unknown>;
    assert.equal(cfg.inviteeDiscountPercent, 15);
    assert.equal(cfg.discountDurationDays, 30);
  });

  test("PUT rejects an out-of-range invitee discount", async () => {
    const { status } = await request("/api/affiliate/admin/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${signAuth(userId)}` },
      body: JSON.stringify({ discountLevels: [], allowanceLevels: [], badgeLevels: [], inviteeDiscountPercent: 150 }),
    });
    assert.equal(status, 400);
  });

  test("DELETE resets invitee config back to env defaults", async () => {
    const { status, body } = await request("/api/affiliate/admin/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${signAuth(userId)}` },
      body: JSON.stringify({ discountLevels: [], allowanceLevels: [], badgeLevels: [], inviteeDiscountPercent: 5, discountDurationDays: 10 }),
    });
    assert.equal(status, 200, JSON.stringify(body));

    const del = await request("/api/affiliate/admin/config", {
      method: "DELETE",
      headers: { Authorization: `Bearer ${signAuth(userId)}` },
    });
    assert.equal(del.status, 200, JSON.stringify(del.body));
    const cfg = (del.body.data as Record<string, unknown>).config as Record<string, unknown>;
    assert.equal(cfg.inviteeDiscountPercent, getEnv().AFFILIATE_INVITEE_DISCOUNT_PERCENT);
    assert.equal(cfg.discountDurationDays, getEnv().AFFILIATE_DISCOUNT_DURATION_DAYS);
  });

  test("DELETE /api/affiliate/admin/config clears the override", async () => {
    const { status, body } = await request("/api/affiliate/admin/config", {
      method: "DELETE",
      headers: { Authorization: `Bearer ${signAuth(userId)}` },
    });
    assert.equal(status, 200, JSON.stringify(body));
    assert.equal((body.data as Record<string, unknown>).configSource, "env");
  });

  test("PUT rejects invalid badge slug", async () => {
    const { status, body } = await request("/api/affiliate/admin/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${signAuth(userId)}` },
      body: JSON.stringify({ badgeLevels: [{ level: 1, value: "nonexistent-badge" }] }),
    });
    assert.equal(status, 400);
    assert.ok(String(body.error).toLowerCase().includes("does not exist"));
  });

  test("PUT rejects duplicate level numbers", async () => {
    const { status, body } = await request("/api/affiliate/admin/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${signAuth(userId)}` },
      body: JSON.stringify({ discountLevels: [{ level: 1, value: "10" }, { level: 1, value: "20" }] }),
    });
    assert.equal(status, 400);
    assert.ok(String(body.error).toLowerCase().includes("unique"));
  });

  test("PUT requires affiliates.manage permission", async () => {
    const basicRole = await prisma.role.create({
      data: { name: "Basic (no affiliates)", slug: `basic_no_aff_${Date.now()}`, permissions: [] },
    });
    const basic = await prisma.user.create({
      data: {acceptedTosVersion: POLICY_VERSIONS.tos, acceptedPrivacyVersion: POLICY_VERSIONS.privacy, acceptedPoliciesAt: new Date(),  username: `aff_basic_http_${Date.now()}`, email: `aff_basic_http_${Date.now()}@test.local`, passwordHash: "x", roleId: basicRole.id },
    });
    const { status } = await request("/api/affiliate/admin/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${signAuth(basic.id)}` },
      body: JSON.stringify({ discountLevels: [] }),
    });
    await prisma.user.delete({ where: { id: basic.id } });
    await prisma.role.delete({ where: { id: basicRole.id } });
    assert.equal(status, 403);
  });
});