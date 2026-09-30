import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import type { Server } from "node:http";
import jwt from "jsonwebtoken";
import app from "../src/app.js";
import { getEnv } from "../src/config/env.js";
import { prisma } from "../src/lib/prisma.js";

// PocketBase OAuth token-handoff tests. The browser signs in at PocketBase
// (email + password stay there) and hands the PB auth token to
// /api/auth/oauth/pocketbase/exchange or /link. These tests stub the PB
// auth-refresh endpoint (setup-env points POCKETBASE_URL at http://mock-pb) and
// verify the platform-side link/provision/login behaviour.

let server: Server;
let baseUrl: string;
let roleId: string;

const ORIGINAL_FETCH = globalThis.fetch;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
    ok: status >= 200 && status < 300,
  });
}

function pbRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "pbusr1",
    collectionId: "coll_users",
    collectionName: "users",
    email: "pbsso_auto@test.local",
    verified: true,
    username: "pbsso_auto",
    name: "PB Auto",
    avatar: "ava1.png",
    created: "2026-01-01 00:00:00.000Z",
    updated: "2026-01-01 00:00:00.000Z",
    ...overrides,
  };
}

function installPocketBaseMock(record: Record<string, unknown> | null) {
  globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
    const u = String(url);
    if (u.startsWith("http://mock-pb/api/collections/users/auth-refresh")) {
      // An invalid/expired PB session surfaces as a 400 with a PB error body.
      if (!record) {
        return jsonResponse({ code: 400, message: "Invalid or expired collection auth token." }, 400);
      }
      // A successful auth-refresh returns a fresh token plus the decoded record.
      return jsonResponse({ token: "refreshed-token", record });
    }
    // Forward method/headers/body for every other URL (the app's own requests).
    return ORIGINAL_FETCH(url, init);
  }) as typeof fetch;
}

async function request(
  path: string,
  init: RequestInit = {}
): Promise<{ status: number; body: Record<string, unknown>; headers: Headers }> {
  const res = await fetch(`${baseUrl}${path}`, init);
  const body = await res.json().catch(() => null);
  return { status: res.status, body, headers: res.headers };
}

function signAuth(userId: string): string {
  return jwt.sign({ userId, purpose: "auth" }, getEnv().JWT_SECRET, { expiresIn: "7d" });
}

async function mkUser(username: string, opts: { totp?: boolean; bypass?: boolean; emailVerified?: boolean } = {}) {
  return prisma.user.create({
    data: {
      username,
      email: `${username}@test.local`,
      emailVerified: opts.emailVerified ?? true,
      emailVerifiedAt: opts.emailVerified ?? true ? new Date() : null,
      passwordHash: "not-a-real-hash",
      roleId,
      totpEnabled: opts.totp ?? false,
      oauthBypass2fa: opts.bypass ?? false,
    },
  });
}

async function mkInvite(createdById: string) {
  return prisma.inviteCode.create({
    data: { code: `pb_${Math.random().toString(36).slice(2, 10)}`, createdById },
  });
}

function exchangePayload(token: string, invite?: string): Record<string, unknown> {
  return { token, ...(invite ? { invite } : {}) };
}

before(async () => {
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
  await prisma.role.create({
    data: { name: "User", slug: "user", permissions: [] },
  });
  const role = await prisma.role.create({
    data: { name: "PB OAuth Test", slug: "pboauth_test", permissions: [] },
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
  globalThis.fetch = ORIGINAL_FETCH;
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

test("pocketbase config advertises enabled with instance flags", async () => {
  const { status, body } = await request("/api/auth/oauth/pocketbase/config");
  assert.equal(status, 200);
  assert.equal(body.success, true);
  assert.equal(body.data.enabled, true);
  assert.equal(body.data.clientUrl, "/api/pb-speed");
  assert.equal(body.data.authCollection, "users");
  assert.equal(body.data.signupRequiresInvite, true);
  assert.equal(body.data.twoFactorBypassAllowed, true);
});

test("exchange rejects a token that is too short", async () => {
  const { status, body } = await request("/api/auth/oauth/pocketbase/exchange", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(exchangePayload("short-token")),
  });
  assert.equal(status, 400);
  assert.equal(body.success, false);
});

test("exchange returns 400 when PocketBase refuses the token", async () => {
  installPocketBaseMock(null);
  const { status, body } = await request("/api/auth/oauth/pocketbase/exchange", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(exchangePayload("a-pb-token-that-is-fake-and-long-enough-1234567890")),
  });
  globalThis.fetch = ORIGINAL_FETCH;
  assert.equal(status, 400, JSON.stringify(body));
  assert.match(String(body.error), /invalid or has expired/i);
});

test("exchange signs in an already-linked PB identity", async () => {
  installPocketBaseMock(pbRecord({ id: "pblinked", email: "pblinked@test.local", username: "pblinked" }));
  const user = await mkUser("pblinked");
  const account = await prisma.oAuthAccount.create({
    data: { userId: user.id, provider: "pocketbase", providerAccountId: "pblinked", email: "old@test.local", emailVerified: false },
  });

  const { status, body } = await request("/api/auth/oauth/pocketbase/exchange", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(exchangePayload("pblinked-valid-token-value-1234567890")),
  });
  globalThis.fetch = ORIGINAL_FETCH;
  assert.equal(status, 200, JSON.stringify(body));
  assert.equal(body.data.status, "logged_in");
  assert.ok(body.data.token);
  assert.equal(body.data.user.username, "pblinked");

  // Linked-identity refresh keeps stored refs fresh without re-provisioning.
  const after = await prisma.oAuthAccount.findUnique({ where: { id: account.id } });
  assert.equal(after!.email, "pblinked@test.local");
  assert.equal(after!.emailVerified, true);
});

test("exchange signs in a linked PB identity that requires 2FA (bypass off)", async () => {
  installPocketBaseMock(pbRecord({ id: "pb2fa", email: "pb2fa@test.local", username: "pb2fa" }));
  const user = await mkUser("pb2fa", { totp: true, bypass: false });
  await prisma.oAuthAccount.create({
    data: { userId: user.id, provider: "pocketbase", providerAccountId: "pb2fa" },
  });

  const { status, body } = await request("/api/auth/oauth/pocketbase/exchange", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(exchangePayload("pb2fa-valid-token-value-1234567890")),
  });
  globalThis.fetch = ORIGINAL_FETCH;
  assert.equal(status, 200);
  assert.equal(body.data.status, "needs_two_factor");
  assert.equal(body.data.methods.totp, true);
  assert.ok(body.data.twoFactorToken);
});

test("exchange auto-links a PB-verified email to an existing VERIFIED account (PB divergence, tenets test)", async () => {
  // Instead of the social-SSO A2 409, a PB-verified email attaches to the
  // matching platform account and signs it in: PocketBase is operator-controlled
  // and the caller proved mailbox control there (first-party trust domain).
  installPocketBaseMock(pbRecord({ id: "pbautolink", email: "pbsso_existing@test.local", username: "pbsso_existing" }));
  await mkUser("pbsso_existing"); // emailVerified true by default

  const { status, body } = await request("/api/auth/oauth/pocketbase/exchange", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(exchangePayload("pbautolink-valid-token-value-1234567890")),
  });
  globalThis.fetch = ORIGINAL_FETCH;
  assert.equal(status, 200, JSON.stringify(body));
  assert.equal(body.data.status, "logged_in");
  assert.equal(body.data.user.username, "pbsso_existing");

  const autoUser = await mkUserUser("pbsso_existing");
  const linked = await prisma.oAuthAccount.findFirst({ where: { userId: autoUser } });
  assert.ok(linked, "PB identity must be attached to the existing account");
  assert.equal(linked!.provider, "pocketbase");
  assert.equal(linked!.providerAccountId, "pbautolink");
});

// Resolve a user id by username without re-mapping; kept local to keep the
// fixture DB assertions readable.
async function mkUserUser(username: string): Promise<string> {
  const u = await prisma.user.findUnique({ where: { username }, select: { id: true } });
  assert.ok(u, `expected user "${username}" to exist`);
  return u!.id;
}

test("exchange PB-verified email VERIFIES an existing UNVERIFIED account (A3b mirror)", async () => {
  installPocketBaseMock(pbRecord({ id: "pbverify", email: "pbsso_verify@test.local", username: "pbsso_verify" }));
  const user = await prisma.user.create({
    data: {
      username: "pbsso_verify",
      email: "pbsso_verify@test.local",
      emailVerified: false,
      emailVerifiedAt: null,
      passwordHash: "not-a-real-hash",
      roleId,
      oauthBypass2fa: false,
    },
  });

  const { status, body } = await request("/api/auth/oauth/pocketbase/exchange", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(exchangePayload("pbverify-valid-token-value-1234567890")),
  });
  globalThis.fetch = ORIGINAL_FETCH;
  assert.equal(status, 200, JSON.stringify(body));
  assert.equal(body.data.status, "logged_in");
  assert.ok(body.data.token);

  const after = await prisma.user.findUnique({ where: { id: user.id } });
  assert.equal(after!.emailVerified, true);
  assert.ok(after!.emailVerifiedAt);
  const linked = await prisma.oAuthAccount.findFirst({ where: { userId: user.id } });
  assert.equal(linked!.providerAccountId, "pbverify");
  assert.equal(linked!.emailVerified, true);
});

test("exchange returns needs_setup (invite required) for a new verified identity without an invite", async () => {
  installPocketBaseMock(pbRecord({ id: "pbnew1", email: "pbnew1@test.local", username: "pbnew1" }));
  const { status, body } = await request("/api/auth/oauth/pocketbase/exchange", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(exchangePayload("pbnew1-valid-token-value-1234567890")),
  });
  globalThis.fetch = ORIGINAL_FETCH;
  assert.equal(status, 200, JSON.stringify(body));
  assert.equal(body.data.status, "needs_setup");
  assert.equal(body.data.requiresInvite, true);
  assert.equal(body.data.requiresEmail, false);
  assert.equal(body.data.provider, "pocketbase");
  assert.ok(body.data.signupToken);
  assert.ok(body.data.suggestedUsername);

  const users = await prisma.user.findMany({ where: { username: "pbnew1" } });
  assert.equal(users.length, 0, "needs_setup must not provision an account");
});

test("exchange provisions a new verified identity instantly with a valid invite", async () => {
  installPocketBaseMock(pbRecord({ id: "pbprovision", email: "pbprovision@test.local", username: "pbprovision" }));
  const referrer = await mkUser("pb_ref_prov");
  await prisma.profile.create({
    data: { userId: referrer.id, slug: "pb_ref_prov", isPrimary: true },
  });
  const invite = await mkInvite(referrer.id);

  const { status, body } = await request("/api/auth/oauth/pocketbase/exchange", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Forwarded-For": "10.20.0.40", "User-Agent": "pb-test-provision" },
    body: JSON.stringify(exchangePayload("pbprovision-valid-token-value-1234567890", invite.code)),
  });
  globalThis.fetch = ORIGINAL_FETCH;
  assert.equal(status, 201, JSON.stringify(body));
  assert.equal(body.data.status, "logged_in");
  assert.ok(body.data.token);
  assert.equal(body.data.user.username, "pbprovision");

  const user = await prisma.user.findUnique({ where: { username: "pbprovision" } });
  assert.ok(user);
  assert.equal(user!.email, "pbprovision@test.local");
  assert.equal(user!.emailVerified, true);
  assert.equal(user!.referredById, referrer.id);

  const linked = await prisma.oAuthAccount.findFirst({ where: { userId: user!.id } });
  assert.ok(linked);
  assert.equal(linked!.provider, "pocketbase");
  assert.equal(linked!.providerAccountId, "pbprovision");
  assert.equal(linked!.emailVerified, true);
  assert.equal(linked!.avatarUrl, "/api/pb-speed/api/files/coll_users/pbprovision/ava1.png");

  const consumed = await prisma.inviteCode.findUnique({ where: { id: invite.id } });
  assert.equal(consumed!.usedById, user!.id);
  assert.ok(consumed!.usedAt);
});

test("exchange returns needs_setup for a new UNVERIFIED PB email (A3a mirror, no provisioning)", async () => {
  installPocketBaseMock(pbRecord({ id: "pbunverified", email: "pbunverified@test.local", username: "pbunverified", verified: false }));
  const { status, body } = await request("/api/auth/oauth/pocketbase/exchange", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(exchangePayload("pbunverified-valid-token-value-1234567890")),
  });
  globalThis.fetch = ORIGINAL_FETCH;
  assert.equal(status, 200, JSON.stringify(body));
  assert.equal(body.data.status, "needs_setup");
  assert.equal(body.data.requiresInvite, true);
  assert.equal(body.data.signupToken !== undefined, true);

  const users = await prisma.user.findMany({ where: { email: "pbunverified@test.local" } });
  assert.equal(users.length, 0, "an unverified PB email must not provision an account");
});

test("exchange rejects an invalid invite code", async () => {
  installPocketBaseMock(pbRecord({ id: "pbbadinv", email: "pbbadinv@test.local", username: "pbbadinv" }));
  const { status, body } = await request("/api/auth/oauth/pocketbase/exchange", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(exchangePayload("pbbadinv-valid-token-value-1234567890", "no-such-invite")),
  });
  globalThis.fetch = ORIGINAL_FETCH;
  assert.equal(status, 400, JSON.stringify(body));
  assert.match(String(body.error), /invalid/i);
});

test("signup completion provisions an UNVERIFIED PB email as an UNVERIFIED account (A3a)", async () => {
  // The signup flow is shared with social SSO; one PB test proves provider
  // "pocketbase" completes through it with the invite gate satisfied.
  installPocketBaseMock(pbRecord({ id: "pbcomplete", email: "pbcomplete@test.local", username: "pbcomplete", verified: false }));
  const { status, body } = await request("/api/auth/oauth/pocketbase/exchange", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(exchangePayload("pbcomplete-valid-token-value-1234567890")),
  });
  const signupToken = body.data.signupToken as string;
  globalThis.fetch = ORIGINAL_FETCH;
  assert.equal(status, 200);
  assert.ok(signupToken);

  const referrer = await mkUser("pb_ref_complete");
  const invite = await mkInvite(referrer.id);
  const signup = await request("/api/auth/oauth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Forwarded-For": "10.20.0.41", "User-Agent": "pb-test-signup" },
    body: JSON.stringify({
      signupToken,
      username: "pbcomplete",
      email: "pbcomplete@test.local",
      inviteCode: invite.code,
    }),
  });
  assert.equal(signup.status, 201, JSON.stringify(signup.body));
  // Unverified address => no session, confirmation mail issued instead.
  assert.equal(signup.body.data.status, "verification_required");
  assert.equal(signup.body.data.token, undefined);

  const user = await prisma.user.findUnique({ where: { username: "pbcomplete" } });
  assert.ok(user);
  assert.equal(user!.emailVerified, false);
  assert.equal(user!.emailVerifiedAt, null);
  const linked = await prisma.oAuthAccount.findFirst({ where: { userId: user!.id } });
  assert.equal(linked!.providerAccountId, "pbcomplete");
  assert.equal(linked!.emailVerified, false);
  const consumed = await prisma.inviteCode.findUnique({ where: { id: invite.id } });
  assert.equal(consumed!.usedById, user!.id);
});

test("link requires authentication", async () => {
  const { status } = await request("/api/auth/oauth/pocketbase/link", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(exchangePayload("any-long-enough-token-1234567890")),
  });
  assert.equal(status, 401);
});

test("link rejects an unverified PB email", async () => {
  installPocketBaseMock(pbRecord({ id: "pblinkun", email: "pblinkun@test.local", username: "pblinkun", verified: false }));
  const user = await mkUser("pblink_auth");
  const token = signAuth(user.id);
  const { status, body } = await request("/api/auth/oauth/pocketbase/link", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(exchangePayload("pblinkun-valid-token-value-1234567890")),
  });
  globalThis.fetch = ORIGINAL_FETCH;
  assert.equal(status, 400, JSON.stringify(body));
  assert.match(String(body.error), /verify your email/i);
});

test("link attaches a verified PB identity to the current account", async () => {
  installPocketBaseMock(pbRecord({ id: "pblink1", email: "pblink1@test.local", username: "pblink1" }));
  const user = await mkUser("pblink_auth2");
  const token = signAuth(user.id);
  const { status, body } = await request("/api/auth/oauth/pocketbase/link", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(exchangePayload("pblink1-valid-token-value-1234567890")),
  });
  globalThis.fetch = ORIGINAL_FETCH;
  assert.equal(status, 200, JSON.stringify(body));
  assert.equal(body.data.linked, true);
  assert.equal(body.data.alreadyLinked, false);

  const linked = await prisma.oAuthAccount.findFirst({ where: { userId: user.id, provider: "pocketbase" } });
  assert.ok(linked);
  assert.equal(linked!.providerAccountId, "pblink1");
});

test("link on an already-linked identity for the SAME user is idempotent", async () => {
  installPocketBaseMock(pbRecord({ id: "pblink2", email: "pblink2@test.local", username: "pblink2" }));
  const user = await mkUser("pblink_auth3");
  await prisma.oAuthAccount.create({
    data: { userId: user.id, provider: "pocketbase", providerAccountId: "pblink2" },
  });
  const token = signAuth(user.id);
  const { status, body } = await request("/api/auth/oauth/pocketbase/link", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(exchangePayload("pblink2-valid-token-value-1234567890")),
  });
  globalThis.fetch = ORIGINAL_FETCH;
  assert.equal(status, 200, JSON.stringify(body));
  assert.equal(body.data.linked, true);
  assert.equal(body.data.alreadyLinked, true);
});

test("link refuses when the PB identity is already linked to ANOTHER account", async () => {
  installPocketBaseMock(pbRecord({ id: "pblink3", email: "pblink3@test.local", username: "pblink3" }));
  const owner = await mkUser("pblink_owner");
  await prisma.oAuthAccount.create({
    data: { userId: owner.id, provider: "pocketbase", providerAccountId: "pblink3" },
  });
  const other = await mkUser("pblink_other");
  const token = signAuth(other.id);
  const { status, body } = await request("/api/auth/oauth/pocketbase/link", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(exchangePayload("pblink3-valid-token-value-1234567890")),
  });
  globalThis.fetch = ORIGINAL_FETCH;
  assert.equal(status, 409, JSON.stringify(body));
  assert.match(String(body.error), /already linked to another account/i);
});

test("unlink can remove a pocketbase identity", async () => {
  const user = await mkUser("pb_unlink_user");
  const linked = await prisma.oAuthAccount.create({
    data: { userId: user.id, provider: "pocketbase", providerAccountId: "pb_unlink_gone" },
  });
  const token = signAuth(user.id);
  const del = await request("/api/auth/oauth/accounts/pocketbase/pb_unlink_gone", {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(del.status, 200, JSON.stringify(del.body));
  assert.equal(del.body.data.removed, true);
  const gone = await prisma.oAuthAccount.findUnique({ where: { id: linked.id } });
  assert.equal(gone, null);
});