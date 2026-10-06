import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import type { Server } from "node:http";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import app from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { getEnv } from "../src/config/env.js";

import { resetAuthGuardSubthresholds } from "../src/lib/authGuard.js";
import { POLICY_VERSIONS } from "../src/lib/newsletter.js";

// A4 — session invalidation: a password change or an admin password reset must
// invalidate every previously issued JWT for that user by bumping
// User.authVersion. Tokens signed before the bump carry the previous version
// (or no `av` claim at all, for pre-A4 tokens) and must be rejected.
describe("A4: session invalidation on credential changes", () => {
  let server: Server;
  let baseUrl: string;
  let roleId: string;
  let adminRoleId: string;
  let targetId = "";
  let resetId = "";

  // A token WITHOUT the `av` claim — simulates a JWT issued before A4 existed.
  function signLegacyAuth(id: string): string {
    return jwt.sign({ userId: id, purpose: "auth" }, getEnv().JWT_SECRET, { expiresIn: "7d" });
  }

  async function request(path: string, init: RequestInit = {}) {
    const res = await fetch(`${baseUrl}${path}`, init);
    const body = (await res.json().catch(() => null)) ?? {};
    return { status: res.status, body };
  }

  async function me(token: string) {
    return request("/api/auth/me", { headers: { Authorization: `Bearer ${token}` } });
  }

  async function login(identifier: string, password: string) {
    return request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier, password }),
    });
  }

  async function mkUser(username: string, passwordHash: string, role: string) {
    const u = await prisma.user.create({
      data: {
        acceptedTosVersion: POLICY_VERSIONS.tos,
        acceptedPrivacyVersion: POLICY_VERSIONS.privacy,
        acceptedPoliciesAt: new Date(),
        username,
        email: `${username}@a4.test`,
        // A3b — fixtures are established, verified accounts so the login
        // verification gate never applies to them.
        emailVerified: true,
        emailVerifiedAt: new Date(),
        passwordHash,
        roleId: role,
      },
    });
    return u;
  }

  before(async () => {
    // Clean any rows left by a previous run, then scaffold users + roles.
    await prisma.user.deleteMany({ where: { email: { endsWith: "@a4.test" } } });
    await prisma.role.deleteMany({ where: { slug: { in: ["a4_user", "a4_admin"] } } });
    // Test isolation: wipe lockout state (bans/logs + in-memory subthreshold
    // tallies) so a permanent block left by an EARLIER file in the same suite
    // (they share the test DB and process) cannot poison these logins.
    await prisma.authBan.deleteMany();
    await prisma.authLog.deleteMany();
    resetAuthGuardSubthresholds();

    const userRole = await prisma.role.create({ data: { name: "A4 User", slug: "a4_user", permissions: [] } });
    const adminRole = await prisma.role.create({ data: { name: "A4 Admin", slug: "a4_admin", permissions: ["users.manage"] } });
    roleId = userRole.id;
    adminRoleId = adminRole.id;

    const hash = await bcrypt.hash("supersecure1", 12);
    targetId = (await mkUser("a4_target", hash, roleId)).id;
    resetId = (await mkUser("a4_reset", hash, roleId)).id;
    await mkUser("a4_admin", hash, adminRoleId);

    server = app.listen(0);
    await once(server, "listening");
    baseUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  });

  after(async () => {
    server.close();
    await once(server, "close");
    await prisma.user.deleteMany({ where: { roleId: { in: [roleId, adminRoleId] } } });
    await prisma.role.deleteMany({ where: { slug: { in: ["a4_user", "a4_admin"] } } });
  });

  test("a pre-A4 legacy token (no av claim) still authenticates an unchanged account", async () => {
    const res = await me(signLegacyAuth(targetId));
    assert.equal(res.status, 200, JSON.stringify(res.body));
  });

  test("a freshly minted login token works", async () => {
    const loginRes = await login("a4_target", "supersecure1");
    assert.equal(loginRes.status, 200, JSON.stringify(loginRes.body));
    const token = (loginRes.body as { data?: { token?: string } }).data?.token;
    assert.ok(token, "login must return a token");
    assert.equal((await me(token!)).status, 200);
  });

  test("changing the password invalidates every previously issued token", async () => {
    const loginRes = await login("a4_target", "supersecure1");
    assert.equal(loginRes.status, 200, JSON.stringify(loginRes.body));
    const token = (loginRes.body as { data: { token: string } }).data.token;
    assert.equal((await me(token)).status, 200);

    // Capture a legacy pre-A4 token too — it must ALSO be invalidated.
    const legacy = signLegacyAuth(targetId);

    const changed = await request("/api/auth/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ currentPassword: "supersecure1", newPassword: "newpass42!" }),
    });
    assert.equal(changed.status, 200, JSON.stringify(changed.body));

    // Old session token must now be rejected...
    const stale = await me(token);
    assert.equal(stale.status, 401, "a token issued before the password change must be invalidated");
    assert.equal(stale.body.error, "Session expired — you signed in with a different set of credentials");
    // ...and so must a legacy pre-A4 token for the same account.
    assert.equal((await me(legacy)).status, 401, "legacy tokens must also be invalidated");

    // The previous password no longer logs in; the new one does and works.
    assert.equal((await login("a4_target", "supersecure1")).status, 401);
    const relogin = await login("a4_target", "newpass42!");
    assert.equal(relogin.status, 200, JSON.stringify(relogin.body));
    const fresh = (relogin.body as { data: { token: string } }).data.token;
    assert.equal((await me(fresh)).status, 200);
  });

  test("an admin password reset invalidates the target user's tokens", async () => {
    const loginRes = await login("a4_reset", "supersecure1");
    assert.equal(loginRes.status, 200, JSON.stringify(loginRes.body));
    const targetToken = (loginRes.body as { data: { token: string } }).data.token;
    const legacy = signLegacyAuth(resetId);
    assert.equal((await me(targetToken)).status, 200);

    const adminLogin = await login("a4_admin", "supersecure1");
    assert.equal(adminLogin.status, 200, "admin login should not require TOTP in this test");
    const adminToken = (adminLogin.body as { data: { token: string } }).data.token;

    const reset = await request(`/api/admin/users/${resetId}/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ newPassword: "resetpass1" }),
    });
    assert.equal(reset.status, 200, JSON.stringify(reset.body));

    assert.equal((await me(targetToken)).status, 401, "the target's pre-reset token must be invalidated");
    assert.equal((await me(legacy)).status, 401, "the target's pre-A4 token must be invalidated");

    const relogin = await login("a4_reset", "resetpass1");
    assert.equal(relogin.status, 200, JSON.stringify(relogin.body));
    const fresh = (relogin.body as { data: { token: string } }).data.token;
    assert.equal((await me(fresh)).status, 200);
  });

  test("admins can still manage after their own account is untouched", async () => {
    // Sanity: A4 must not break the admin session used for the reset above.
    const adminLogin = await login("a4_admin", "supersecure1");
    assert.equal(adminLogin.status, 200, JSON.stringify(adminLogin.body));
    const adminToken = (adminLogin.body as { data: { token: string } }).data.token;
    assert.equal((await me(adminToken)).status, 200);
  });
});