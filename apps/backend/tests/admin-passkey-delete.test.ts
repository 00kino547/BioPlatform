import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import type { Server } from "node:http";
import jwt from "jsonwebtoken";
import app from "../src/app.js";
import { getEnv } from "../src/config/env.js";
import { prisma } from "../src/lib/prisma.js";
import { POLICY_VERSIONS } from "../src/lib/newsletter.js";

let server: Server;
let baseUrl: string;
let adminRoleId: string;
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
  await prisma.passkey.deleteMany();
  await prisma.user.deleteMany({ where: { role: { slug: { in: ["passkey_admin", "passkey_target"] } } } });
  await prisma.role.deleteMany({ where: { slug: { in: ["passkey_admin", "passkey_target"] } } });

  const arole = await prisma.role.create({
    data: { name: "Passkey Admin", slug: "passkey_admin", permissions: ["users.manage"] },
  });
  adminRoleId = arole.id;
  const troule = await prisma.role.create({
    data: { name: "Passkey Target", slug: "passkey_target", permissions: [] },
  });
  const targetRoleId = troule.id;

  const a = await prisma.user.create({
    data: {acceptedTosVersion: POLICY_VERSIONS.tos, acceptedPrivacyVersion: POLICY_VERSIONS.privacy, acceptedPoliciesAt: new Date(), acceptedTosVersion: POLICY_VERSIONS.tos, acceptedPrivacyVersion: POLICY_VERSIONS.privacy, acceptedPoliciesAt: new Date(),  username: "passkey_admin_user", email: "passkey_admin_user@test.local", passwordHash: "x", roleId: adminRoleId },
  });
  admin = { id: a.id };
  const t = await prisma.user.create({
    data: {acceptedTosVersion: POLICY_VERSIONS.tos, acceptedPrivacyVersion: POLICY_VERSIONS.privacy, acceptedPoliciesAt: new Date(), acceptedTosVersion: POLICY_VERSIONS.tos, acceptedPrivacyVersion: POLICY_VERSIONS.privacy, acceptedPoliciesAt: new Date(),  username: "passkey_target_user", email: "passkey_target_user@test.local", passwordHash: "x", roleId: targetRoleId },
  });
  target = { id: t.id };

  const r = app.listen(0);
  await once(r, "listening");
  server = r;
  const addr = r.address();
  baseUrl = typeof addr === "object" && addr ? `http://127.0.0.1:${addr.port}` : "";
});

after(async () => {
  await prisma.passkey.deleteMany();
  await prisma.user.deleteMany({ where: { role: { slug: { in: ["passkey_admin", "passkey_target"] } } } });
  await prisma.role.deleteMany({ where: { id: adminRoleId } });
  server?.close();
});

test("admin passkey delete rejects a non-admin caller", async () => {
  const res = await request(`/api/admin/users/${target.id}/passkeys/some-id`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${signAuth(target.id)}` },
  });
  assert.equal(res.status, 403, JSON.stringify(res.body));
});

test("admin passkey delete 404s for an unknown user or foreign passkey", async () => {
  const headers = { Authorization: `Bearer ${signAuth(admin.id)}` };
  const noUser = await request(`/api/admin/users/00000000-0000-0000-0000-000000000000/passkeys/x`, {
    method: "DELETE",
    headers,
  });
  assert.equal(noUser.status, 404);

  const passkey = await prisma.passkey.create({
    data: {
      userId: target.id,
      credentialId: "pk_404_foreign",
      publicKey: "base64pub",
      name: "foreign",
      transports: [],
    },
  });
  const noKey = await request(`/api/admin/users/${target.id}/passkeys/00000000-0000-0000-0000-000000000000`, {
    method: "DELETE",
    headers,
  });
  assert.equal(noKey.status, 404);
  await prisma.passkey.delete({ where: { id: passkey.id } });
});

test("admin can delete a user's passkey and it is gone", async () => {
  const headers = {
    Authorization: `Bearer ${signAuth(admin.id)}`,
  };
  const passkey = await prisma.passkey.create({
    data: {
      userId: target.id,
      credentialId: "pk_remove_me",
      publicKey: "base64pub",
      name: "yubikey",
      residentKey: true,
      transports: [],
    },
  });

  const res = await request(`/api/admin/users/${target.id}/passkeys/${passkey.id}`, {
    method: "DELETE",
    headers,
  });
  assert.equal(res.status, 200, JSON.stringify(res.body));

  const leftover = await prisma.passkey.findUnique({ where: { id: passkey.id } });
  assert.equal(leftover, null, "passkey must be deleted");
  assert.equal(res.body?.data?.passkeyCount, 0, "security recompute reflects the deletion");
});