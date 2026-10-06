import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import type { Server } from "node:http";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import app from "../src/app.js";
import { getEnv } from "../src/config/env.js";
import { prisma } from "../src/lib/prisma.js";
import { resetAuthGuardSubthresholds } from "../src/lib/authGuard.js";
import { liveSendDest, destEmail } from "./helpers/live-email.js";
import { POLICY_VERSIONS } from "../src/lib/newsletter.js";

// Email-sending tests are OPT-IN (manual): a plain `pnpm test` run forces SMTP
// off (see tests/setup-env.ts + tests/helpers/live-email.ts) so no real mail is
// ever sent automatically. To exercise the actual send paths, run with
// RUN_LIVE_EMAIL_TESTS=1 and TEST_EMAIL_TO (a real destination the operator
// controls). When opted in, every test-generated address is derived from that
// real domain — never fabricated .test/.local destinations.

// A3b — full double opt-in for local registration. New accounts start
// UNVERIFIED: register answers `verification_required` (no session), password
// login is gated until the signed link verifies the email, and
// `/verify-email` completes it.
describe("A3b: email verification for local accounts", () => {
  let server: Server;
  let baseUrl: string;

  async function request(path: string, init: RequestInit = {}) {
    const res = await fetch(`${baseUrl}${path}`, init);
    const body = (await res.json().catch(() => null)) ?? {};
    return { status: res.status, body: body as Record<string, Record<string, unknown> | string | boolean | undefined> };
  }

  async function mkInviter(): Promise<string> {
    const role = await prisma.role.findUniqueOrThrow({ where: { slug: "user" } });
    const inviter = await prisma.user.create({
      data: {acceptedTosVersion: POLICY_VERSIONS.tos, acceptedPrivacyVersion: POLICY_VERSIONS.privacy, acceptedPoliciesAt: new Date(),  username: `ev_inviter_${Date.now()}`, email: destEmail(`ev_inviter_${Date.now()}`), passwordHash: await bcrypt.hash("supersecure1", 12), roleId: role.id },
    });
    const code = `ev_inv_${Math.random().toString(36).slice(2, 10)}`;
    await prisma.inviteCode.create({ data: { code, createdById: inviter.id } });
    return code;
  }

  // Each register uses a UNIQUE loopback-ish client IP: the invite-abuse
  // detector treats "one invite already used from this device/network" as
  // abuse, and every test process shares ip 127.0.0.1 otherwise.
  let regIpSeq = 0;

  function registerPayload(username: string, inviteCode: string) {
    regIpSeq += 1;
    return {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Forwarded-For": `10.0.0.${regIpSeq}`,
        "User-Agent": `ev-reg-${regIpSeq}`,
      },
      body: JSON.stringify({
        username,
        email: destEmail(username),
        password: "supersecure1",
        inviteCode,
        acceptedPolicies: true,
      }),
    };
  }

  // Mirror the server-side link-builder so tests can round-trip it without a
  // real SMTP capture.
  function verifyTokenFor(userId: string, email: string, opts: { expiresIn?: string; purpose?: string } = {}) {
    return jwt.sign(
      { userId, email, purpose: opts.purpose ?? "email_verify" },
      getEnv().JWT_SECRET,
      { expiresIn: (opts.expiresIn ?? "72h") as jwt.SignOptions["expiresIn"] }
    );
  }

  async function login(identifier: string, password: string) {
    return request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier, password }),
    });
  }

  before(async () => {
    // Recreate the suite state from scratch (same exclusive-DB convention as
    // the other backend test files), wiping lockout artifacts first so a
    // permanent block left by an earlier file cannot poison these logins.
    await prisma.authLog.deleteMany();
    await prisma.authBan.deleteMany();
    await prisma.oAuthAccount.deleteMany();
    await prisma.pageView.deleteMany();
    await prisma.linkClick.deleteMany();
    await prisma.profileAlias.deleteMany();
    await prisma.inviteCode.deleteMany();
    await prisma.inviteGrantEvent.deleteMany();
    await prisma.profile.deleteMany();
    await prisma.user.deleteMany();
    await prisma.role.deleteMany();
    resetAuthGuardSubthresholds();

    await prisma.role.create({ data: { name: "User", slug: "user", permissions: [] } });
    await prisma.role.create({ data: { name: "EV User", slug: "ev_user", permissions: [] } });

    server = app.listen(0);
    await once(server, "listening");
    const addr = server.address();
    if (!addr || typeof addr === "string") throw new Error("no listening address");
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  after(async () => {
    server?.close();
    await prisma.oAuthAccount.deleteMany();
    await prisma.pageView.deleteMany();
    await prisma.linkClick.deleteMany();
    await prisma.profileAlias.deleteMany();
    await prisma.inviteCode.deleteMany();
    await prisma.inviteGrantEvent.deleteMany();
    await prisma.authLog.deleteMany();
    await prisma.authBan.deleteMany();
    await prisma.profile.deleteMany();
    await prisma.user.deleteMany();
    await prisma.role.deleteMany();
  });

  test("register creates an unverified account and answers verification_required (no session)", async () => {
    const invite = await mkInviter();
    const res = await request("/api/auth/register", registerPayload("ev_unverified", invite));
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.data?.status, "verification_required");
    assert.equal("token" in (res.body.data ?? {}), false, "no session token may be issued to an unverified account");
    assert.equal(typeof res.body.data?.emailSent, "boolean", "emailSent must be reported (best-effort send)");

    const user = await prisma.user.findUnique({ where: { username: "ev_unverified" } });
    assert.ok(user);
    assert.equal(user!.email, destEmail("ev_unverified"));
    assert.equal(user!.emailVerified, false);
    assert.equal(user!.emailVerifiedAt, null);
  });

  test("an unverified account is blocked at login without counting failed attempts", async () => {
    const invite = await mkInviter();
    await request("/api/auth/register", registerPayload("ev_gated", invite));
    const user = await prisma.user.findUniqueOrThrow({ where: { username: "ev_gated" } });

    // Correct password, but the gate must reject with verifyEmailRequired —
    // and it must NOT register lockout failures (that would let an attacker
    // farm the ban counters by typing credentials at unverified accounts).
    for (let i = 0; i < 4; i++) {
      const res = await login(destEmail("ev_gated"), "supersecure1");
      assert.equal(res.status, 403, `attempt ${i + 1} must hit the verification gate`);
      assert.equal(res.body.verifyEmailRequired, true);
    }

    const ban = await prisma.authBan.findFirst({ where: { kind: "ACCOUNT", value: user.id } });
    assert.equal(ban, null, "the verification gate must never escalate to a lockout");
  });

  test("verification link round-trip unlocks login", async () => {
    const invite = await mkInviter();
    await request("/api/auth/register", registerPayload("ev_verified", invite));
    const user = await prisma.user.findUniqueOrThrow({ where: { username: "ev_verified" } });

    const res = await request("/api/auth/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: verifyTokenFor(user.id, user.email!) }),
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.data?.status, "verified");
    assert.equal(Boolean(res.body.data?.alreadyVerified), false, "first verification must not claim it was already verified");

    const updated = await prisma.user.findUniqueOrThrow({ where: { username: "ev_verified" } });
    assert.equal(updated.emailVerified, true);
    assert.ok(updated.emailVerifiedAt, "emailVerifiedAt must be stamped");

    const loginRes = await login(destEmail("ev_verified"), "supersecure1");
    assert.equal(loginRes.status, 200, JSON.stringify(loginRes.body));
    assert.ok((loginRes.body.data as { token?: string } | undefined)?.token, "verified account must get a session");
  });

  test("verifying an already-verified account is idempotent", async () => {
    const invite = await mkInviter();
    await request("/api/auth/register", registerPayload("ev_twice", invite));
    const user = await prisma.user.findUniqueOrThrow({ where: { username: "ev_twice" } });
    const token = verifyTokenFor(user.id, user.email!);

    await request("/api/auth/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    const again = await request("/api/auth/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    assert.equal(again.status, 200, JSON.stringify(again.body));
    assert.equal(again.body.data?.status, "verified");
    assert.equal(again.body.data?.alreadyVerified, true);
  });

  test("a token with the wrong purpose or garbage is rejected", async () => {
    const invite = await mkInviter();
    await request("/api/auth/register", registerPayload("ev_badtoken", invite));
    const user = await prisma.user.findUniqueOrThrow({ where: { username: "ev_badtoken" } });

    const wrongPurpose = await request("/api/auth/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: verifyTokenFor(user.id, user.email!, { purpose: "unlock" }) }),
    });
    assert.equal(wrongPurpose.status, 400, JSON.stringify(wrongPurpose.body));

    const garbage = await request("/api/auth/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "not-a-real-token" }),
    });
    assert.equal(garbage.status, 400, JSON.stringify(garbage.body));

    const after = await prisma.user.findUniqueOrThrow({ where: { username: "ev_badtoken" } });
    assert.equal(after.emailVerified, false, "no rejected token may flip the flag");
  });

  test("an expired link is rejected", async () => {
    const invite = await mkInviter();
    await request("/api/auth/register", registerPayload("ev_expired", invite));
    const user = await prisma.user.findUniqueOrThrow({ where: { username: "ev_expired" } });

    const res = await request("/api/auth/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: verifyTokenFor(user.id, user.email!, { expiresIn: "-1s" }) }),
    });
    assert.equal(res.status, 400);
    assert.match(String(res.body.error ?? ""), /invalid|expired/i);
  });

  test("resend never reveals whether an identifier maps to an unverified account", async () => {
    // Anti-enumeration must hold identically whether SMTP is disabled (default
    // test run: endpoint answers 503 "Email is not configured") or opted in for
    // live sends (RUN_LIVE_EMAIL_TESTS=1: endpoint answers 200 {sent:true}).
    // Unknown and known identifiers must ALWAYS return the same status+shape.
    const invite = await mkInviter();
    await request("/api/auth/register", registerPayload("ev_resend", invite));

    const knownIdentifier = destEmail("ev_resend");
    const unknownIdentifier = destEmail("nobody_at_everywhere");

    const unknown = await request("/api/auth/verify-email/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: unknownIdentifier }),
    });

    const known = await request("/api/auth/verify-email/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: knownIdentifier }),
    });

    // Identical status + identical success shape for both identifiers — the
    // endpoint must never leak which one is a real unverified account.
    assert.equal(known.status, unknown.status, "known and unknown identifiers must share the exact status");
    assert.equal(Boolean(known.body.success), Boolean(unknown.body.success), "identical success shape");

    if (liveSendDest) {
      // Opted-in live run: the actual send path is exercised for the known
      // identifier and reports the canonical "sent" answer.
      assert.equal(known.status, 200, JSON.stringify(known.body));
      assert.equal(known.body.data?.sent, true, "known identifiers must return the sent answer");
    } else {
      // Default run (SMTP off): both fail identically with the disabled error.
      assert.equal(known.status, 503, JSON.stringify(known.body));
      assert.match(String(known.body.error ?? ""), /email.*not.*configured/i, "disabled send must report email not configured");
    }
  });
});