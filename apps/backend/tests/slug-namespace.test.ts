import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import type { Server } from "node:http";
import jwt from "jsonwebtoken";
import app from "../src/app.js";
import { getEnv } from "../src/config/env.js";
import { prisma } from "../src/lib/prisma.js";
import { destEmail } from "./helpers/live-email.js";
import { POLICY_VERSIONS } from "../src/lib/newsletter.js";

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

async function mkUser(username: string) {
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

async function mkInvite(createdById: string): Promise<string> {
  const code = `slug_${Math.random().toString(36).slice(2, 10)}`;
  await prisma.inviteCode.create({ data: { code, createdById } });
  return code;
}

before(async () => {
  await prisma.inviteCode.deleteMany();
  await prisma.profileAlias.deleteMany();
  await prisma.slugNamespace.deleteMany();
  await prisma.profile.deleteMany();
  await prisma.user.deleteMany();
  await prisma.role.deleteMany();

  await prisma.role.create({ data: { name: "User", slug: "user", permissions: [] } });
  const role = await prisma.role.create({
    data: { name: "Slug Test", slug: "slug_test", permissions: [] },
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
  await prisma.inviteCode.deleteMany();
  await prisma.profileAlias.deleteMany();
  await prisma.slugNamespace.deleteMany();
  await prisma.profile.deleteMany();
  await prisma.user.deleteMany();
  await prisma.role.deleteMany();
});

function registerPayload(username: string, inviteCode: string) {
  return {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username,
      email: destEmail(username),
      password: "supersecure1",
      inviteCode,
      acceptedPolicies: true,
    }),
  };
}

function authHeaders(userId: string) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${jwt.sign({ userId, purpose: "auth" }, getEnv().JWT_SECRET, { expiresIn: "7d" })}`,
  };
}

test("register rejects a username that collides with an existing alias", async () => {
  const inviter = await mkUser(`inviter_${Date.now()}`);
  const invite = await mkInvite(inviter.id);

  const creator = await mkUser(`creator_${Date.now()}`);
  const profile = await prisma.profile.create({
    data: { userId: creator.id, slug: creator.username, isPrimary: true },
  });
  await prisma.profileAlias.create({ data: { profileId: profile.id, slug: "slugclash" } });
  await prisma.slugNamespace.create({ data: { slug: "slugclash", kind: "alias", profileId: profile.id } });

  const res = await request("/api/auth/register", registerPayload("slugclash", invite));

  assert.equal(res.status, 409);
  // No user and no profile/namespace row must be left behind.
  const leftoverUser = await prisma.user.findUnique({ where: { username: "slugclash" } });
  assert.equal(leftoverUser, null);
  const leftoverProfile = await prisma.profile.findUnique({ where: { slug: "slugclash" } });
  assert.equal(leftoverProfile, null);
});

test("register creates a primary profile plus a shared-namespace entry", async () => {
  const inviter = await mkUser(`inviter2_${Date.now()}`);
  const invite = await mkInvite(inviter.id);
  const username = `fresh${Date.now().toString(36)}`;

  const res = await request("/api/auth/register", registerPayload(username, invite));
  assert.equal(res.status, 201);

  const profile = await prisma.profile.findUnique({ where: { slug: username } });
  assert.ok(profile, "primary profile created with the username slug");
  const ns = await prisma.slugNamespace.findUnique({ where: { slug: username } });
  assert.ok(ns, "slug reserved in the shared namespace");
  assert.equal(ns.kind, "profile");
  assert.equal(ns.profileId, profile!.id);
});

test("deleting an alias (via API) releases its slug from the shared namespace", async () => {
  const creator = await prisma.user.create({
    data: {
      acceptedTosVersion: POLICY_VERSIONS.tos,
      acceptedPrivacyVersion: POLICY_VERSIONS.privacy,
      acceptedPoliciesAt: new Date(),
      username: `creator3_${Date.now()}`,
      email: `creator3_${Date.now()}@test.local`,
      passwordHash: "not-a-real-hash",
      roleId,
      tier: "PRO",
    },
  });
  const profile = await prisma.profile.create({
    data: { userId: creator.id, slug: creator.username, isPrimary: true },
  });
  const profileId = profile.id;
  const token = authHeaders(creator.id);

  const created = await request(`/api/profiles/me/${profileId}/aliases`, {
    method: "POST",
    headers: token,
    body: JSON.stringify({ slug: "releaseme" }),
  });
  assert.equal(created.status, 201, "alias create should succeed");

  const aliasId = created.body?.data?.id as string;
  assert.ok(aliasId, "alias has an id");

  const nsBefore = await prisma.slugNamespace.findUnique({ where: { slug: "releaseme" } });
  assert.ok(nsBefore, "alias create reserves the slug");

  const deleted = await request(`/api/profiles/me/${profileId}/aliases/${aliasId}`, {
    method: "DELETE",
    headers: token,
  });
  assert.equal(deleted.status, 200);

  const nsAfter = await prisma.slugNamespace.findUnique({ where: { slug: "releaseme" } });
  assert.equal(nsAfter, null, "alias delete must free the namespace slug");
});