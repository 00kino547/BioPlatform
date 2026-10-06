import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import type { Server } from "node:http";
import bcrypt from "bcrypt";
import app from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { signTwoFactorToken } from "../src/routes/auth.js";
import { isFullyAuthenticated } from "../src/middleware/rateLimit.js";
import { resetAuthGuardSubthresholds } from "../src/lib/authGuard.js";
import { POLICY_VERSIONS } from "../src/lib/newsletter.js";

// A2: a correct password that still requires 2FA must NOT reset lockouts —
// only a response carrying the final auth token may clear accumulated bans.
describe("A2: lockout reset scope", () => {
  let server: Server;
  let baseUrl: string;

  async function request(
    path: string,
    init: RequestInit = {}
  ): Promise<{ status: number; body: Record<string, unknown>; cookie: string | null }> {
    const res = await fetch(`${baseUrl}${path}`, init);
    const body = (await res.json().catch(() => null)) ?? {};
    const cookie = res.headers.get("set-cookie");
    return { status: res.status, body, cookie };
  }

  before(async () => {
    await prisma.authBan.deleteMany();
    await prisma.authLog.deleteMany();
    await prisma.user.deleteMany();
    await prisma.role.deleteMany();
    resetAuthGuardSubthresholds();
    resetAuthGuardSubthresholds();

    const role = await prisma.role.create({ data: { name: "User", slug: "user", permissions: [] } });

    const hash = await bcrypt.hash("supersecure1", 12);
    for (const name of ["hisoka", "shalnark"]) {
      await prisma.user.create({
        data: {
          acceptedTosVersion: POLICY_VERSIONS.tos,
          acceptedPrivacyVersion: POLICY_VERSIONS.privacy,
          acceptedPoliciesAt: new Date(),
          username: name,
          email: `${name}@lockout.test`,
          passwordHash: hash,
          roleId: role.id,
          // A3b — fixtures are established, verified accounts so the login
          // verification gate never applies to them.
          emailVerified: true,
          emailVerifiedAt: new Date(),
          totpEnabled: true,
          // Any valid base32 secret — 2FA is verified against it via otplib.
          totpSecret: "JBSWY3DPEHPK3PXP",
        },
      });
    }

    server = app.listen(0);
    await once(server, "listening");
    baseUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  });

  after(async () => {
    server.close();
    await once(server, "close");
  });

  test("isFullyAuthenticated treats requiresTwoFactor as NOT authenticated", () => {
    assert.equal(isFullyAuthenticated({ data: { requiresTwoFactor: true } }), false);
    assert.equal(isFullyAuthenticated({ data: { requiresTwoFactor: true, token: "" } }), false);
    assert.equal(isFullyAuthenticated({ data: { token: "jwt-token" } }), true);
    assert.equal(isFullyAuthenticated({ data: {} }), false);
    assert.equal(isFullyAuthenticated(null), false);
  });

  test("a permanent account ban blocks even a correct password and survives", async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { username: "hisoka" } });

    await prisma.authBan.create({
      data: { kind: "ACCOUNT", value: user.id, failCount: 99, permanent: true, lockedUntil: null },
    });

    const attempt = await request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: "hisoka", password: "supersecure1" }),
    });
    assert.equal(attempt.status, 403, "a permanent account ban must be enforced pre-route");

    const ban = await prisma.authBan.findUnique({
      where: { kind_value: { kind: "ACCOUNT", value: user.id } },
    });
    assert.ok(ban, "the account ban must not be cleared by a password attempt");
    assert.equal(ban.permanent, true);
    assert.equal(ban.failCount, 99, "the ban counter must be untouched");
  });

  test("2FA brute-force still escalates to a permanent block", async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { username: "shalnark" } });
    const twoFactorToken = signTwoFactorToken(user.id);

    const loginCookie = (
      await request("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: "shalnark", password: "supersecure1" }),
      })
    ).cookie;

    const attempt = (code: string) =>
      request("/api/auth/2fa/totp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(loginCookie ? { Cookie: loginCookie.split(";")[0] } : {}),
        },
        body: JSON.stringify({ token: twoFactorToken, code }),
      });

    for (let i = 0; i < 4; i++) {
      const res = await attempt("000000");
      assert.equal(res.status, 401, `attempt ${i + 1} must reject a wrong code`);
    }

    const blocked = await attempt("000000");
    assert.equal(blocked.status, 403, "the 5th attempt must be blocked, not merely rejected");

    const escalated = await prisma.authBan.findFirst({
      where: {
        OR: [
          { kind: "ACCOUNT", value: user.id },
          { kind: "IP", value: "127.0.0.1" },
        ],
      },
    });
    assert.ok(escalated, "2FA brute-force must record an escalated (permanent) lockout at the account or IP layer");
    assert.equal(escalated.permanent, true, "with default lock duration, over-threshold is permanent");
  });
});