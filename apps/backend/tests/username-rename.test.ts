import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import type { Server } from "node:http";
import jwt from "jsonwebtoken";
import app from "../src/app.js";
import { getEnv } from "../src/config/env.js";
import { prisma } from "../src/lib/prisma.js";
import { USERNAME_RENAME_COOLDOWN_MS } from "../src/routes/profile.js";

let server: Server;
let baseUrl: string;
let roleId: string;

async function request(
  path: string,
  init: RequestInit = {}
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetch(`${baseUrl}${path}`, init);
  const body = (await res.json().catch(() => null)) ?? {};
  return { status: res.status, body };
}

function authHeaders(userId: string) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${jwt.sign({ userId, purpose: "auth" }, getEnv().JWT_SECRET, { expiresIn: "7d" })}`,
  };
}

async function mkUser(username: string) {
  return prisma.user.create({
    data: {
      username,
      email: `${username}@test.local`,
      passwordHash: "not-a-real-hash",
      roleId,
    },
  });
}

async function mkUserWithPrimary(username: string): Promise<{ user: Awaited<ReturnType<typeof mkUser>>; profileId: string }> {
  const user = await mkUser(username);
  const profile = await prisma.profile.create({
    data: { userId: user.id, slug: username, isPrimary: true },
  });
  await prisma.slugNamespace.create({ data: { slug: username, kind: "profile", profileId: profile.id } });
  return { user, profileId: profile.id };
}

before(async () => {
  await prisma.profileAlias.deleteMany();
  await prisma.slugNamespace.deleteMany();
  await prisma.profile.deleteMany();
  await prisma.user.deleteMany();
  await prisma.role.deleteMany();

  await prisma.role.create({ data: { name: "User", slug: "user", permissions: [] } });
  const role = await prisma.role.create({
    data: { name: "Username Test", slug: "username_test", permissions: [] },
  });
  roleId = role.id;

  server = app.listen(0);
  await once(server, "listening");
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("no listening address");
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

after(async () => {
  server?.close();
  await prisma.profileAlias.deleteMany();
  await prisma.slugNamespace.deleteMany();
  await prisma.profile.deleteMany();
  await prisma.user.deleteMany();
  await prisma.role.deleteMany();
});

test("username availability rejects invalid handles", async () => {
  const { user } = await mkUserWithPrimary(`avail_${Date.now().toString(36)}`);
  const bad = await request(`/api/profiles/me/username/availability?username=${encodeURIComponent("UPPER")}`, {
    headers: authHeaders(user.id),
  });
  assert.equal(bad.status, 400);
  const short = await request(`/api/profiles/me/username/availability?username=ab`, {
    headers: authHeaders(user.id),
  });
  assert.equal(short.status, 400);
});

test("username availability: reserved and taken handles", async () => {
  const { user } = await mkUserWithPrimary(`avail2_${Date.now().toString(36)}`);
  const owner = await mkUserWithPrimary(`availowner_${Date.now().toString(36)}`);
  const headers = authHeaders(user.id);

  const reserved = await request(`/api/profiles/me/username/availability?username=login`, {
    headers,
  });
  assert.equal(reserved.status, 200);
  assert.equal(reserved.body?.data?.available, false);
  assert.equal(reserved.body?.data?.reason, "reserved");

  const taken = await request(`/api/profiles/me/username/availability?username=${owner.user.username}`, {
    headers,
  });
  assert.equal(taken.status, 200);
  assert.equal(taken.body?.data?.available, false);
  assert.equal(taken.body?.data?.reason, "taken");
});

test("username availability: a currently free handle is available", async () => {
  const { user } = await mkUserWithPrimary(`avail3_${Date.now().toString(36)}`);
  const free = `free_${Date.now().toString(36)}`;
  const res = await request(`/api/profiles/me/username/availability?username=${free}`, {
    headers: authHeaders(user.id),
  });
  assert.equal(res.status, 200);
  assert.equal(res.body?.data?.available, true);
  assert.equal(res.body?.data?.reason, "available");
});

test("username rename moves handle, slug, and namespace atomically", async () => {
  const oldName = `rename_${Date.now().toString(36)}`;
  const { user, profileId } = await mkUserWithPrimary(oldName);
  const newName = `renamed_${Date.now().toString(36)}`;

  const res = await request("/api/profiles/me/username", {
    method: "PATCH",
    headers: authHeaders(user.id),
    body: JSON.stringify({ username: newName }),
  });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body?.data?.username, newName);
  assert.equal(res.body?.data?.slug, newName);

  const freshUser = await prisma.user.findUnique({ where: { id: user.id } });
  assert.equal(freshUser?.username, newName);
  assert.ok(freshUser?.lastUsernameChangeAt, "cooldown timestamp recorded");

  const freshProfile = await prisma.profile.findUnique({ where: { id: profileId } });
  assert.equal(freshProfile?.slug, newName, "primary profile slug follows the handle");

  // The new handle is claimed in the shared namespace, the old one is a redirect alias.
  const nsNew = await prisma.slugNamespace.findUnique({ where: { slug: newName } });
  assert.ok(nsNew, "new slug reserved");
  assert.equal(nsNew?.kind, "profile");
  const nsOld = await prisma.slugNamespace.findUnique({ where: { slug: oldName } });
  assert.equal(nsOld?.kind, "alias", "old slug becomes an alias");
  const alias = await prisma.profileAlias.findUnique({ where: { slug: oldName } });
  assert.ok(alias, "auto-alias created for the old slug");
});

test("username rename enforces the 30-day cooldown", async () => {
  const oldName = `cdata_${Date.now().toString(36)}`;
  const { user } = await mkUserWithPrimary(oldName);
  await prisma.user.update({ where: { id: user.id }, data: { lastUsernameChangeAt: new Date() } });

  const res = await request("/api/profiles/me/username", {
    method: "PATCH",
    headers: authHeaders(user.id),
    body: JSON.stringify({ username: `cdata2_${Date.now().toString(36)}` }),
  });
  assert.equal(res.status, 429, JSON.stringify(res.body));
  assert.match(String(res.body?.error), /wait/i);
});

test("username rename rejects an identity collision with 409", async () => {
  const { user } = await mkUserWithPrimary(`collide_${Date.now().toString(36)}`);
  await prisma.user.update({
    where: { id: user.id },
    data: { lastUsernameChangeAt: new Date(Date.now() - USERNAME_RENAME_COOLDOWN_MS - 60_000) },
  });
  const other = await mkUserWithPrimary(`collide2_${Date.now().toString(36)}`);

  const res = await request("/api/profiles/me/username", {
    method: "PATCH",
    headers: authHeaders(user.id),
    body: JSON.stringify({ username: other.user.username }),
  });
  assert.equal(res.status, 409, JSON.stringify(res.body));
});

test("username rename is rejected for a reserved or invalid name", async () => {
  const { user } = await mkUserWithPrimary(`reserved_${Date.now().toString(36)}`);

  const res = await request("/api/profiles/me/username", {
    method: "PATCH",
    headers: authHeaders(user.id),
    body: JSON.stringify({ username: "login" }),
  });
  assert.equal(res.status, 400, JSON.stringify(res.body));
});