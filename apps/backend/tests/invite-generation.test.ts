import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import jwt from "jsonwebtoken";
import app from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { getEnv } from "../src/config/env.js";
import { getInviteGenerationEnabled, setInviteGenerationEnabled, runInviteRefundSweep } from "../src/lib/inviteService.js";
import { POLICY_VERSIONS } from "../src/lib/newsletter.js";

describe("invite generation (allowance applies to admins too)", () => {
  let server: Server;
  let baseUrl: string;
  let adminRoleId: string;
  let viewerRoleId: string;
  let admin: { id: string };
  let viewer: { id: string };
  let previousGenerationEnabled = false;

  function signAuth(id: string): string {
    return jwt.sign({ userId: id, purpose: "auth" }, getEnv().JWT_SECRET, { expiresIn: "7d" });
  }

  async function request(path: string, init: RequestInit = {}) {
    const res = await fetch(`${baseUrl}${path}`, init);
    const body = await res.json().catch(() => null);
    return { status: res.status, body };
  }

  function post(path: string, token: string, body: Record<string, unknown> = {}) {
    return request(path, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
  }

  before(async () => {
    previousGenerationEnabled = await getInviteGenerationEnabled();
    await setInviteGenerationEnabled(true);

    await prisma.inviteCode.deleteMany({
      where: { createdBy: { role: { slug: { in: ["invgen_admin", "invgen_viewer"] } } } },
    });
    await prisma.user.deleteMany({
      where: { role: { slug: { in: ["invgen_admin", "invgen_viewer"] } } },
    });
    await prisma.role.deleteMany({ where: { slug: { in: ["invgen_admin", "invgen_viewer"] } } });

    const adminRole = await prisma.role.create({
      data: { name: "InvGen Admin", slug: "invgen_admin", permissions: ["invites.manage"] },
    });
    adminRoleId = adminRole.id;
    const viewerRole = await prisma.role.create({
      data: { name: "InvGen Viewer", slug: "invgen_viewer", permissions: ["users.view"] },
    });
    viewerRoleId = viewerRole.id;

    const a = await prisma.user.create({
      data: {
        acceptedTosVersion: POLICY_VERSIONS.tos,
        acceptedPrivacyVersion: POLICY_VERSIONS.privacy,
        acceptedPoliciesAt: new Date(),
        username: "invgen_admin_user",
        email: "invgen_admin_user@test.local",
        passwordHash: "x",
        roleId: adminRoleId,
        inviteAllowance: 2,
        inviteAllowanceExpiresAt: new Date(Date.now() + 30 * 86400000),
      },
    });
    admin = { id: a.id };
    const v = await prisma.user.create({
      data: {
        acceptedTosVersion: POLICY_VERSIONS.tos,
        acceptedPrivacyVersion: POLICY_VERSIONS.privacy,
        acceptedPoliciesAt: new Date(),
        username: "invgen_viewer_user",
        email: "invgen_viewer_user@test.local",
        passwordHash: "x",
        roleId: viewerRoleId,
      },
    });
    viewer = { id: v.id };

    const r = app.listen(0);
    await new Promise<void>((resolve) => r.on("listening", resolve));
    server = r;
    const addr = r.address();
    baseUrl = typeof addr === "object" && addr ? `http://127.0.0.1:${addr.port}` : "";
  });

  after(async () => {
    await prisma.inviteCode.deleteMany({
      where: { createdById: { in: [admin.id, viewer.id] } },
    });
    await prisma.user.deleteMany({ where: { id: { in: [admin.id, viewer.id] } } });
    await prisma.role.deleteMany({ where: { id: { in: [adminRoleId, viewerRoleId] } } });
    await setInviteGenerationEnabled(previousGenerationEnabled);
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  test("self-service generation consumes the event allowance even for invites.manage holders", async () => {
    const res = await post("/api/invites", signAuth(admin.id), { count: 5 });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.ok(Array.isArray(res.body.data), "expected a data array");
    assert.equal(res.body.data.length, 2, "batch should be clamped to the allowance");
    assert.equal(res.body.meta.allowance, 0, "allowance should be consumed");

    const fresh = await prisma.user.findUnique({ where: { id: admin.id }, select: { inviteAllowance: true } });
    assert.equal(fresh?.inviteAllowance, 0);
  });

  test("a second self-service call is rejected once the allowance is spent", async () => {
    const res = await post("/api/invites", signAuth(admin.id), { count: 1 });
    assert.equal(res.status, 403, JSON.stringify(res.body));
    assert.match(String(res.body.error), /no invite credits/i);
  });

  test("the admin-only generator creates codes without consuming allowance", async () => {
    const res = await post("/api/admin/invites", signAuth(admin.id), { count: 3 });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.ok(Array.isArray(res.body.data));
    assert.equal(res.body.data.length, 3);

    const fresh = await prisma.user.findUnique({ where: { id: admin.id }, select: { inviteAllowance: true } });
    assert.equal(fresh?.inviteAllowance, 0, "admin generator must not touch the allowance");
  });

  test("the admin-only generator requires invites.manage", async () => {
    const res = await post("/api/admin/invites", signAuth(viewer.id), { count: 1 });
    assert.equal(res.status, 403, JSON.stringify(res.body));
  });
});

describe("invite refund sweep (expired-allowance credit)", () => {
  let roleId: string;
  let userId: string;

  before(async () => {
    await prisma.user.deleteMany({ where: { role: { slug: "sweep_test" } } });
    await prisma.role.deleteMany({ where: { slug: "sweep_test" } });

    const role = await prisma.role.create({
      data: { name: "Sweep Test", slug: "sweep_test", permissions: [] },
    });
    roleId = role.id;
    const u = await prisma.user.create({
      data: {
        acceptedTosVersion: POLICY_VERSIONS.tos,
        acceptedPrivacyVersion: POLICY_VERSIONS.privacy,
        acceptedPoliciesAt: new Date(),
        username: `sweep_${Math.random().toString(36).slice(2, 8)}`,
        email: `sweep_${Math.random().toString(36).slice(2, 8)}@test.local`,
        passwordHash: "x",
        roleId,
        inviteAllowance: 0,
        inviteAllowanceExpiresAt: new Date(Date.now() + 30 * 86400000),
      },
    });
    userId = u.id;
  });

  after(async () => {
    await prisma.inviteCode.deleteMany({ where: { createdById: userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.role.deleteMany({ where: { id: roleId } });
  });

  test("two concurrent sweeps credit the allowance only once", async () => {
    // One expired, from-allowance invite that expires before the allowance window.
    const code = await prisma.inviteCode.create({
      data: {
        code: `SWEEP${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
        createdById: userId,
        fromAllowance: true,
        expiresAt: new Date(Date.now() - 1000),
      },
    });

    await Promise.all([runInviteRefundSweep(userId), runInviteRefundSweep(userId)]);

    const fresh = await prisma.user.findUnique({ where: { id: userId }, select: { inviteAllowance: true } });
    assert.equal(fresh?.inviteAllowance, 1, "allowance must be incremented exactly once");

    const marked = await prisma.inviteCode.findUnique({ where: { id: code.id }, select: { refundedAt: true } });
    assert.ok(marked?.refundedAt instanceof Date, "the code should be marked refunded");
  });

  test("a sweep that transitions nothing credits nothing", async () => {
    await runInviteRefundSweep(userId);
    const fresh = await prisma.user.findUnique({ where: { id: userId }, select: { inviteAllowance: true } });
    assert.equal(fresh?.inviteAllowance, 1, "no new refundable codes, no credit");
  });
});
