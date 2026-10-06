import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import jwt from "jsonwebtoken";
import app from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { getEnv } from "../src/config/env.js";
import { POLICY_VERSIONS } from "../src/lib/newsletter.js";

describe("invite notes", () => {
  let server: Server;
  let baseUrl: string;
  let ownerRoleId: string;
  let adminRoleId: string;
  let ownerId: string;
  let strangerId: string;
  let adminId: string;

  function signAuth(id: string): string {
    return jwt.sign({ userId: id, purpose: "auth" }, getEnv().JWT_SECRET, { expiresIn: "7d" });
  }

  async function request(path: string, init: RequestInit = {}) {
    const res = await fetch(`${baseUrl}${path}`, init);
    const body = await res.json().catch(() => null);
    return { status: res.status, body };
  }

  async function mkUser(username: string, roleId: string) {
    return prisma.user.create({
      data: {
        acceptedTosVersion: POLICY_VERSIONS.tos,
        acceptedPrivacyVersion: POLICY_VERSIONS.privacy,
        acceptedPoliciesAt: new Date(),
        username,
        email: `${username}@test.local`,
        passwordHash: "not-a-real-hash",
        roleId,
      },
    });
  }

  before(async () => {
    await prisma.role.deleteMany({ where: { slug: { in: ["notes_owner", "notes_admin"] } } });
    await prisma.user.deleteMany({ where: { username: { startsWith: "note_" } } });
    await prisma.inviteCode.deleteMany({ where: { createdBy: { username: { startsWith: "note_" } } } });

    const ownerRole = await prisma.role.create({
      data: { name: "Notes Owner", slug: "notes_owner", permissions: [], inviteCooldownMinutes: 0 },
    });
    ownerRoleId = ownerRole.id;
    const adminRole = await prisma.role.create({
      data: {
        name: "Notes Admin",
        slug: "notes_admin",
        permissions: ["invites.manage"],
        inviteCooldownMinutes: 0,
      },
    });
    adminRoleId = adminRole.id;

    let u = await mkUser("note_owner", ownerRoleId);
    ownerId = u.id;
    u = await mkUser("note_stranger", ownerRoleId);
    strangerId = u.id;
    u = await mkUser("note_admin", adminRoleId);
    adminId = u.id;

    const r = app.listen(0);
    await new Promise<void>((resolve) => r.on("listening", resolve));
    server = r;
    const addr = r.address();
    baseUrl = typeof addr === "object" && addr ? `http://127.0.0.1:${addr.port}` : "";
  });

  after(async () => {
    await prisma.inviteCode.deleteMany({ where: { createdBy: { username: { startsWith: "note_" } } } });
    await prisma.user.deleteMany({ where: { username: { startsWith: "note_" } } });
    await prisma.role.deleteMany({ where: { id: { in: [ownerRoleId, adminRoleId] } } });
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  async function mkCode(opts: { by?: string } = {}) {
    const c = await prisma.inviteCode.create({
      data: {
        code: randomUUID().replace(/-/g, "").slice(0, 16),
        createdById: opts.by ?? ownerId,
      },
    });
    return c;
  }

  test("owner can set a note on their code and it appears in the list", async () => {
    const code = await mkCode();
    const { status, body } = await request(`/api/invites/${code.id}/note`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${signAuth(ownerId)}` },
      body: JSON.stringify({ note: "gift for the design team" }),
    });
    assert.equal(status, 200, JSON.stringify(body));
    assert.equal((body.data as Record<string, unknown>).note, "gift for the design team");

    const list = await request("/api/invites", {
      headers: { Authorization: `Bearer ${signAuth(ownerId)}` },
    });
    const row = (list.body.data as Array<{ id: string; note: string | null }>).find((r) => r.id === code.id);
    assert.equal(row?.note, "gift for the design team");
  });

  test("notes are sanitized of HTML-like characters", async () => {
    const code = await mkCode();
    const { status, body } = await request(`/api/invites/${code.id}/note`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${signAuth(ownerId)}` },
      body: JSON.stringify({ note: "<a>hi</a> {x}" }),
    });
    assert.equal(status, 200, JSON.stringify(body));
    assert.equal((body.data as Record<string, unknown>).note, "ahi/a x");
  });

  test("empty string clears the note", async () => {
    const code = await mkCode();
    const set = await request(`/api/invites/${code.id}/note`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${signAuth(ownerId)}` },
      body: JSON.stringify({ note: "temporary" }),
    });
    assert.equal(set.status, 200);
    const clear = await request(`/api/invites/${code.id}/note`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${signAuth(ownerId)}` },
      body: JSON.stringify({ note: "   " }),
    });
    assert.equal(clear.status, 200);
    assert.equal((clear.body.data as Record<string, unknown>).note, null);
  });

  test("non-owner without invites.manage cannot set a note", async () => {
    const code = await mkCode();
    const { status, body } = await request(`/api/invites/${code.id}/note`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${signAuth(strangerId)}` },
      body: JSON.stringify({ note: "sneaky" }),
    });
    assert.equal(status, 403, JSON.stringify(body));
  });

  test("admin with invites.manage can set a note on another user's code", async () => {
    const code = await mkCode();
    const { status, body } = await request(`/api/invites/${code.id}/note`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${signAuth(adminId)}` },
      body: JSON.stringify({ note: "admin annotation" }),
    });
    assert.equal(status, 200, JSON.stringify(body));
    assert.equal((body.data as Record<string, unknown>).note, "admin annotation");
  });

  test("overlong note is rejected", async () => {
    const code = await mkCode();
    const { status } = await request(`/api/invites/${code.id}/note`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${signAuth(ownerId)}` },
      body: JSON.stringify({ note: "x".repeat(501) }),
    });
    assert.equal(status, 400);
  });

  test("missing code returns 404", async () => {
    const { status } = await request("/api/invites/00000000-0000-0000-0000-000000000000/note", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${signAuth(ownerId)}` },
      body: JSON.stringify({ note: "nope" }),
    });
    assert.equal(status, 404);
  });
});