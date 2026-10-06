import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import jwt from "jsonwebtoken";
import app from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { getEnv } from "../src/config/env.js";
import { setInviteGenerationEnabled, computeSeatInfo, countConsumedInvites } from "../src/lib/inviteService.js";
import { POLICY_VERSIONS } from "../src/lib/newsletter.js";

describe("enterprise seat limits (invite generation)", () => {
  let server: Server;
  let baseUrl: string;
  let roleId: string;
  let seatLimitedId: string;

  function signAuth(id: string): string {
    return jwt.sign({ userId: id, purpose: "auth" }, getEnv().JWT_SECRET, { expiresIn: "7d" });
  }

  async function request(path: string, init: RequestInit = {}) {
    const res = await fetch(`${baseUrl}${path}`, init);
    const body = await res.json().catch(() => null);
    return { status: res.status, body };
  }

  async function generate(token: string, count: number) {
    return request("/api/invites", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ count }),
    });
  }

  async function mkUser(username: string, data: Record<string, unknown> = {}) {
    const u = await prisma.user.create({
      data: {
        acceptedTosVersion: POLICY_VERSIONS.tos,
        acceptedPrivacyVersion: POLICY_VERSIONS.privacy,
        acceptedPoliciesAt: new Date(),
        username,
        email: `${username}@test.local`,
        passwordHash: "not-a-real-hash",
        roleId,
        ...data,
      },
    });
    return u;
  }

  before(async () => {
    await setInviteGenerationEnabled(true);
    await prisma.inviteCode.deleteMany({ where: { createdBy: { roleId } } });
    await prisma.order.deleteMany();
    await prisma.user.deleteMany({ where: { roleId } });
    await prisma.role.deleteMany({ where: { slug: "seat_test" } });

    const role = await prisma.role.create({
      data: { name: "Seat Test", slug: "seat_test", permissions: [], inviteCooldownMinutes: 0 },
    });
    roleId = role.id;

    const u = await mkUser("seat_gifted", {
      tier: "ENTERPRISE",
      seatLimit: 2,
      inviteAllowance: 100,
    });
    seatLimitedId = u.id;

    const r = app.listen(0);
    await new Promise<void>((resolve) => r.on("listening", resolve));
    server = r;
    const addr = r.address();
    baseUrl = typeof addr === "object" && addr ? `http://127.0.0.1:${addr.port}` : "";
  });

  after(async () => {
    await setInviteGenerationEnabled(false);
    await prisma.inviteCode.deleteMany({ where: { createdBy: { roleId } } });
    await prisma.order.deleteMany();
    await prisma.user.deleteMany({ where: { roleId } });
    await prisma.role.delete({ where: { id: roleId } });
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  test("computeSeatInfo: gifted enterprise with a seat limit is limited", async () => {
    const info = await computeSeatInfo(seatLimitedId, { tier: "ENTERPRISE", seatLimit: 2 });
    assert.equal(info.limited, true);
    assert.equal(info.limit, 2);
    assert.equal(info.used, 0);
    assert.equal(info.remaining, 2);
  });

  test("computeSeatInfo: paid enterprise with a seat limit is not limited", async () => {
    const paid = await mkUser("seat_paid", {
      tier: "ENTERPRISE",
      seatLimit: 2,
      inviteAllowance: 100,
    });
    await prisma.order.create({
      data: {
        userId: paid.id,
        plan: "ENTERPRISE",
        method: "MANUAL",
        status: "PAID",
        basePriceCents: 2900,
        discountPercent: 0,
        finalPriceCents: 2900,
        paidAt: new Date(),
      },
    });
    const info = await computeSeatInfo(paid.id, { tier: "ENTERPRISE", seatLimit: 2 });
    assert.equal(info.limited, false);
  });

  test("gifted enterprise can generate up to the remaining seats", async () => {
    const res = await generate(signAuth(seatLimitedId), 2);
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.ok(Array.isArray(res.body.data) && res.body.data.length === 2);
    await prisma.inviteCode.deleteMany({ where: { createdById: seatLimitedId } });
  });

  test("batch is capped at the remaining seats", async () => {
    const res = await generate(signAuth(seatLimitedId), 3);
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.ok(Array.isArray(res.body.data) && res.body.data.length === 2);
    await prisma.inviteCode.deleteMany({ where: { createdById: seatLimitedId, usedById: null } });
  });

  test("generation is blocked once the seat limit is reached", async () => {
    const holder1 = await mkUser(`seat_cons1_${randomUUID().slice(0, 8)}`);
    const holder2 = await mkUser(`seat_cons2_${randomUUID().slice(0, 8)}`);
    await prisma.inviteCode.createMany({
      data: [
        { code: `used-${Math.random().toString(16).slice(2, 10)}`, createdById: seatLimitedId, usedById: holder1.id, usedAt: new Date() },
        { code: `used-${Math.random().toString(16).slice(2, 10)}`, createdById: seatLimitedId, usedById: holder2.id, usedAt: new Date() },
      ],
    });
    assert.equal(await countConsumedInvites(seatLimitedId), 2);

    const res = await generate(signAuth(seatLimitedId), 1);
    assert.equal(res.status, 403, JSON.stringify(res.body));
    assert.ok(String(res.body.error).includes("team seat limit"));
  });

  test("meta exposes the seat info", async () => {
    const res = await request("/api/invites", {
      headers: { Authorization: `Bearer ${signAuth(seatLimitedId)}` },
    });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.meta.seat, { limited: true, limit: 2, used: 2, remaining: 0 });
  });

  test("seat limit does not apply to non-enterprise users", async () => {
    const free = await mkUser("seat_free", { tier: "FREE", seatLimit: 1, inviteAllowance: 10 });
    const info = await computeSeatInfo(free.id, { tier: "FREE", seatLimit: 1 });
    assert.equal(info.limited, false);
    const res = await generate(signAuth(free.id), 2);
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.ok(Array.isArray(res.body.data) && res.body.data.length === 2);
  });

  test("seat limit is a no-op when seatLimit is null", async () => {
    const nobody = await mkUser("seat_none", { tier: "ENTERPRISE", seatLimit: null, inviteAllowance: 10 });
    const info = await computeSeatInfo(nobody.id, { tier: "ENTERPRISE", seatLimit: null });
    assert.equal(info.limited, false);
    const res = await generate(signAuth(nobody.id), 2);
    assert.equal(res.status, 201, JSON.stringify(res.body));
  });
});

describe("enterprise seat limits (admin)", () => {
  let server: Server;
  let baseUrl: string;
  let adminRoleId: string;
  let targetRoleId: string;
  let admin: { id: string };
  let target: { id: string };

  function signAuth(id: string): string {
    return jwt.sign({ userId: id, purpose: "auth" }, getEnv().JWT_SECRET, { expiresIn: "7d" });
  }

  async function request(path: string, init: RequestInit = {}) {
    const res = await fetch(`${baseUrl}${path}`, init);
    const body = await res.json().catch(() => null);
    return { status: res.status, body };
  }

  before(async () => {
    await prisma.order.deleteMany();
    await prisma.user.deleteMany({ where: { role: { slug: { in: ["seat_admin", "seat_target"] } } } });
    await prisma.role.deleteMany({ where: { slug: { in: ["seat_admin", "seat_target"] } } });

    const arole = await prisma.role.create({
      data: { name: "Seat Admin", slug: "seat_admin", permissions: ["users.view", "users.manage"] },
    });
    adminRoleId = arole.id;
    const troule = await prisma.role.create({
      data: { name: "Seat Target", slug: "seat_target", permissions: [] },
    });
    targetRoleId = troule.id;

    const a = await prisma.user.create({
      data: {acceptedTosVersion: POLICY_VERSIONS.tos, acceptedPrivacyVersion: POLICY_VERSIONS.privacy, acceptedPoliciesAt: new Date(), acceptedTosVersion: POLICY_VERSIONS.tos, acceptedPrivacyVersion: POLICY_VERSIONS.privacy, acceptedPoliciesAt: new Date(),  username: "seat_admin_user", email: "seat_admin_user@test.local", passwordHash: "x", roleId: adminRoleId },
    });
    admin = { id: a.id };
    const t = await prisma.user.create({
      data: {acceptedTosVersion: POLICY_VERSIONS.tos, acceptedPrivacyVersion: POLICY_VERSIONS.privacy, acceptedPoliciesAt: new Date(), acceptedTosVersion: POLICY_VERSIONS.tos, acceptedPrivacyVersion: POLICY_VERSIONS.privacy, acceptedPoliciesAt: new Date(),  username: "seat_target_user", email: "seat_target_user@test.local", passwordHash: "x", roleId: targetRoleId, tier: "ENTERPRISE" },
    });
    target = { id: t.id };

    const r = app.listen(0);
    await new Promise<void>((resolve) => r.on("listening", resolve));
    server = r;
    const addr = r.address();
    baseUrl = typeof addr === "object" && addr ? `http://127.0.0.1:${addr.port}` : "";
  });

  after(async () => {
    await prisma.order.deleteMany();
    await prisma.inviteCode.deleteMany({ where: { createdBy: { roleId: targetRoleId } } });
    await prisma.user.deleteMany({ where: { role: { slug: { in: ["seat_admin", "seat_target"] } } } });
    await prisma.role.delete({ where: { id: adminRoleId } });
    await prisma.role.delete({ where: { id: targetRoleId } });
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  test("admin can set a seat limit via PATCH and read it back", async () => {
    const res = await request(`/api/admin/users/${target.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${signAuth(admin.id)}` },
      body: JSON.stringify({ seatLimit: 5 }),
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.data.seatLimit, 5);
    assert.equal(res.body.data.seatsUsed, 0);
    assert.equal(res.body.data.hasPaidOrder, false);
  });

  test("admin can clear a seat limit with null", async () => {
    const res = await request(`/api/admin/users/${target.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${signAuth(admin.id)}` },
      body: JSON.stringify({ seatLimit: null }),
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.data.seatLimit, null);
  });

  test("GET /api/admin/users returns seat metadata", async () => {
    const res = await request("/api/admin/users", {
      headers: { Authorization: `Bearer ${signAuth(admin.id)}` },
    });
    assert.equal(res.status, 200);
    const found = Array.isArray(res.body.data)
      ? res.body.data.find((u: { id: string }) => u.id === target.id)
      : undefined;
    assert.ok(found, "target user not in list");
    assert.ok("seatLimit" in found);
    assert.ok("seatsUsed" in found);
    assert.ok("hasPaidOrder" in found);
  });

  test("rejects a negative or oversized seat limit", async () => {
    const res = await request(`/api/admin/users/${target.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${signAuth(admin.id)}` },
      body: JSON.stringify({ seatLimit: -1 }),
    });
    assert.equal(res.status, 400);
  });
});