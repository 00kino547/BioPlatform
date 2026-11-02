import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import type { Server } from "node:http";
import bcrypt from "bcrypt";
import app from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { signToken } from "../src/routes/auth.js";
import { ALL_PERMISSIONS } from "../src/lib/permissions.js";
import { isDiscordWebhookUrl } from "../src/lib/discord.js";
import { POLICY_VERSIONS } from "../src/lib/newsletter.js";

/**
 * Regression coverage for the current-canary security review. These tests use
 * throwaway users and roles only; they never create invite codes or call a
 * provider.
 */
describe("security hardening", () => {
  let server: Server;
  let baseUrl: string;
  let delegateRoleId = "";
  let delegateUserId = "";
  let publicUserId = "";
  let patchRoleId = "";

  async function request(path: string, init: RequestInit = {}) {
    const res = await fetch(`${baseUrl}${path}`, init);
    const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    return { status: res.status, body };
  }

  async function authToken(userId: string) {
    return signToken(userId, "7d");
  }

  before(async () => {
    await prisma.user.deleteMany({ where: { username: { in: ["security_delegate", "security_public"] } } });
    await prisma.role.deleteMany({ where: { slug: { in: ["security_delegate", "security_public", "security_patch"] } } });

    const delegateRole = await prisma.role.create({
      data: { name: "Security Delegate", slug: "security_delegate", permissions: ["roles.manage"] },
    });
    const publicRole = await prisma.role.create({
      data: { name: "Security Public", slug: "security_public", permissions: [] },
    });
    const passwordHash = await bcrypt.hash("supersecure1", 12);
    const delegate = await prisma.user.create({
      data: {
        username: "security_delegate",
        email: "security_delegate@test.local",
        passwordHash,
        roleId: delegateRole.id,
        emailVerified: true,
        emailVerifiedAt: new Date(),
        acceptedTosVersion: POLICY_VERSIONS.tos,
        acceptedPrivacyVersion: POLICY_VERSIONS.privacy,
        acceptedPoliciesAt: new Date(),
      },
    });
    const publicUser = await prisma.user.create({
      data: {
        username: "security_public",
        email: "security_public@test.local",
        passwordHash,
        roleId: publicRole.id,
        emailVerified: true,
        emailVerifiedAt: new Date(),
        acceptedTosVersion: POLICY_VERSIONS.tos,
        acceptedPrivacyVersion: POLICY_VERSIONS.privacy,
        acceptedPoliciesAt: new Date(),
      },
    });
    await prisma.profile.create({
      data: { userId: publicUser.id, slug: "security-public", isPrimary: true, isPublic: true },
    });

    delegateRoleId = delegateRole.id;
    delegateUserId = delegate.id;
    publicUserId = publicUser.id;
    server = app.listen(0);
    await once(server, "listening");
    baseUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  });

  after(async () => {
    await prisma.authBan.deleteMany({ where: { value: delegateUserId } });
    await prisma.user.deleteMany({ where: { id: { in: [delegateUserId, publicUserId] } } });
    await prisma.role.deleteMany({ where: { id: { in: [delegateRoleId, patchRoleId] } } });
    server.close();
    await once(server, "close");
  });

  test("role managers cannot grant permissions beyond their own role", async () => {
    const token = await authToken(delegateUserId);
    const create = await request("/api/admin/roles", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: "Security Full", permissions: ALL_PERMISSIONS }),
    });
    assert.equal(create.status, 403);

    const patchRole = await prisma.role.create({
      data: { name: "Security Patch", slug: "security_patch", permissions: [] },
    });
    patchRoleId = patchRole.id;
    const patch = await request(`/api/admin/roles/${patchRole.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ permissions: ALL_PERMISSIONS }),
    });
    assert.equal(patch.status, 403);
    const unchanged = await prisma.role.findUniqueOrThrow({ where: { id: patchRole.id } });
    assert.deepEqual(unchanged.permissions, []);
  });

  test("an account lock revokes an existing bearer session", async () => {
    const token = await authToken(delegateUserId);
    await prisma.authBan.upsert({
      where: { kind_value: { kind: "ACCOUNT", value: delegateUserId } },
      update: { failCount: 99, permanent: true, lockedUntil: null },
      create: { kind: "ACCOUNT", value: delegateUserId, failCount: 99, permanent: true, lockedUntil: null },
    });
    const locked = await request("/api/auth/me", { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(locked.status, 423);
    await prisma.authBan.deleteMany({ where: { value: delegateUserId } });
  });

  test("TOTP and passkey registration require current password", async () => {
    const token = await authToken(delegateUserId);
    const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
    const totp = await request("/api/auth/totp/setup", { method: "POST", headers, body: JSON.stringify({}) });
    assert.equal(totp.status, 400);

    const passkey = await request("/api/auth/passkeys/register", { method: "POST", headers, body: JSON.stringify({}) });
    assert.equal(passkey.status, 400);
  });

  test("public profiles do not expose the owner user id", async () => {
    const profile = await request("/api/profiles/security-public");
    assert.equal(profile.status, 200);
    const data = profile.body?.data as Record<string, unknown>;
    assert.equal("userId" in data, false);
  });

  test("Discord webhook validation requires HTTPS", () => {
    assert.equal(isDiscordWebhookUrl("http://discord.com/api/webhooks/123/token"), false);
    assert.equal(isDiscordWebhookUrl("https://discord.com/api/webhooks/123/token"), true);
  });
});
