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
let roleId: string;

const ORIGINAL_FETCH = globalThis.fetch;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
    ok: status >= 200 && status < 300,
  });
}

function installGoogleProviderMock(profile: Record<string, unknown>) {
  globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
    const u = String(url);
    if (u.startsWith("https://oauth2.googleapis.com/token")) {
      return jsonResponse({ access_token: "at123" });
    }
    if (u.startsWith("https://www.googleapis.com/oauth2/v3/userinfo")) {
      return jsonResponse(profile);
    }
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

function exchangeCode(payload: Record<string, unknown>): string {
  return jwt.sign({ purpose: "oauth_exchange", ...payload }, getEnv().JWT_SECRET, { expiresIn: "10m" });
}

function signupToken(payload: Record<string, unknown>): string {
  return jwt.sign({ purpose: "oauth_signup", ...payload }, getEnv().JWT_SECRET, { expiresIn: "15m" });
}

function stateToken(payload: Record<string, unknown>): string {
  return jwt.sign({ purpose: "oauth_state", ...payload }, getEnv().JWT_SECRET, { expiresIn: "10m" });
}

function locationCode(location: string | null): string {
  assert.ok(location, "expected a redirect Location");
  const url = new URL(location);
  const code = url.searchParams.get("code");
  assert.ok(code, "expected a code query param in redirect");
  return code;
}

async function mkUser(username: string, opts: { totp?: boolean; bypass?: boolean } = {}) {
  return prisma.user.create({
    data: {
      acceptedTosVersion: POLICY_VERSIONS.tos,
      acceptedPrivacyVersion: POLICY_VERSIONS.privacy,
      acceptedPoliciesAt: new Date(),
      username,
      email: `${username}@test.local`,
      // A3b — fixtures are established accounts: verified email, so the
      // login gate (unverified accounts are blocked) never applies.
      emailVerified: true,
      emailVerifiedAt: new Date(),
      passwordHash: "not-a-real-hash",
      roleId,
      totpEnabled: opts.totp ?? false,
      oauthBypass2fa: opts.bypass ?? false,
    },
  });
}

async function mkInvite(createdById: string) {
  return prisma.inviteCode.create({
    data: { code: `sso_${Math.random().toString(36).slice(2, 10)}`, createdById },
  });
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
    data: { name: "OAuth Test", slug: "oauth_test", permissions: [] },
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

test("config advertises google with instance flags", async () => {
  const { status, body } = await request("/api/auth/oauth/config");
  assert.equal(status, 200);
  assert.equal(body.success, true);
  assert.equal(body.data.providers.includes("google"), true);
  assert.equal(body.data.signupRequiresInvite, true);
  assert.equal(body.data.twoFactorBypassAllowed, true);
});

test("start returns a provider authorize URL and sets the state cookie", async () => {
  const referrer = await mkUser("sso_start_ref");
  const invite = await mkInvite(referrer.id);
  const { status, body, headers } = await request("/api/auth/oauth/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider: "google", mode: "signup", invite: invite.code }),
  });
  assert.equal(status, 200);
  const url = new URL(body.data.redirectUrl);
  assert.equal(url.origin, "https://accounts.google.com");
  assert.match(url.pathname, /\/o\/oauth2\/v2\/auth/);
  assert.equal(url.searchParams.get("client_id"), "google-test-client");
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.ok(url.searchParams.get("code_challenge"));
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.ok(headers.get("set-cookie")?.includes("oauth_state="));
});

test("start with an unknown provider is rejected", async () => {
  const { status, body } = await request("/api/auth/oauth/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider: "facebook", mode: "login" }),
  });
  assert.equal(status, 400);
  assert.equal(body.success, false);
});

test("callback + exchange auto-creates a verified account via invite (referral edge)", async () => {
  const referrer = await mkUser("sso_ref_a");
  await prisma.profile.create({
    data: { userId: referrer.id, slug: "sso_ref_a", isPrimary: true },
  });
  const invite = await mkInvite(referrer.id);
  const st = stateToken({ provider: "google", mode: "signup", verifier: "verifier-a", invite: invite.code });
  installGoogleProviderMock({
    sub: "gid_auto",
    email: "sso_autocreated@test.local",
    email_verified: true,
    name: "Auto Create",
    picture: "https://img/a",
  });

  const res = await fetch(
    `${baseUrl}/api/auth/oauth/callback?provider=google&code=pc&state=${encodeURIComponent(st)}`,
    { headers: { Cookie: `oauth_state=${encodeURIComponent(st)}` }, redirect: "manual" }
  );
  globalThis.fetch = ORIGINAL_FETCH;
  assert.equal(res.status, 302);
  const code = locationCode(res.headers.get("location"));

  const { status, body } = await request("/api/auth/oauth/exchange", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Forwarded-For": "10.20.0.1", "User-Agent": "oauth-test-auto-create" },
    body: JSON.stringify({ code }),
  });
  assert.equal(status, 201, JSON.stringify(body));
  assert.equal(body.success, true);
  assert.equal(body.data.status, "logged_in");
  assert.ok(body.data.token);
  assert.equal(body.data.user.username, "sso_autocreated");

  const user = await prisma.user.findUnique({ where: { username: "sso_autocreated" } });
  assert.ok(user);
  assert.equal(user.email, "sso_autocreated@test.local");
  assert.ok(user.passwordHash);
  const linked = await prisma.oAuthAccount.findFirst({ where: { userId: user!.id } });
  assert.ok(linked);
  assert.equal(linked!.provider, "google");
  assert.equal(linked!.providerAccountId, "gid_auto");
  assert.equal(linked!.emailVerified, true);

  const consumed = await prisma.inviteCode.findUnique({ where: { id: invite.id } });
  assert.equal(consumed!.usedById, user!.id);
  assert.ok(consumed!.usedAt);
  const discount = await prisma.user.findUnique({ where: { id: user!.id } });
  assert.equal(discount!.referredById, referrer.id);
  assert.equal(discount!.discountPercent, getEnv().AFFILIATE_INVITEE_DISCOUNT_PERCENT);
});

test("callback + exchange refuses to silently link a verified matching email to an existing account (A2)", async () => {
  const existing = await mkUser("sso_existing_user");
  const st = stateToken({ provider: "google", mode: "login", verifier: "verifier-b" });
  installGoogleProviderMock({
    sub: "gid_link",
    email: "sso_existing_user@test.local",
    email_verified: true,
    name: "Existing User",
  });
  const res = await fetch(
    `${baseUrl}/api/auth/oauth/callback?provider=google&code=pc&state=${encodeURIComponent(st)}`,
    { headers: { Cookie: `oauth_state=${encodeURIComponent(st)}` }, redirect: "manual" }
  );
  globalThis.fetch = ORIGINAL_FETCH;
  assert.equal(res.status, 302);
  const code = locationCode(res.headers.get("location"));

  const { status, body } = await request("/api/auth/oauth/exchange", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
  // The provider identity is NOT linked to this platform account, so a
  // matching verified email must never silently attach the identity and log
  // the caller in — that would hand the caller a session they did not earn.
  assert.equal(status, 409, JSON.stringify(body));
  assert.equal(body.success, false);
  assert.match(body.error, /already exists/i);

  const linked = await prisma.oAuthAccount.findFirst({ where: { userId: existing.id } });
  assert.equal(linked, null, "no provider identity may be auto-attached to the existing account");
  globalThis.fetch = ORIGINAL_FETCH;
});

test("callback works without a provider query param (real provider redirect shape)", async () => {
  const st = stateToken({ provider: "google", mode: "login", verifier: "verifier-c" });
  installGoogleProviderMock({
    sub: "gid_noprov",
    email: "sso_noprov@test.local",
    email_verified: true,
    name: "No Provider Param",
  });
  const res = await fetch(
    `${baseUrl}/api/auth/oauth/callback?code=pc&state=${encodeURIComponent(st)}`,
    { headers: { Cookie: `oauth_state=${encodeURIComponent(st)}` }, redirect: "manual" }
  );
  globalThis.fetch = ORIGINAL_FETCH;
  assert.equal(res.status, 302);
  const location = res.headers.get("location");
  assert.ok(location);
  assert.ok(new URL(location).searchParams.get("code"), "expected an exchange code, not an error redirect");
});

test("callback relays a provider error (access_denied) to the frontend", async () => {
  const st = stateToken({ provider: "google", mode: "login", verifier: "verifier-d" });
  const res = await fetch(
    `${baseUrl}/api/auth/oauth/callback?error=access_denied&state=${encodeURIComponent(st)}`,
    { headers: { Cookie: `oauth_state=${encodeURIComponent(st)}` }, redirect: "manual" }
  );
  assert.equal(res.status, 302);
  const location = res.headers.get("location");
  assert.ok(location);
  const url = new URL(location);
  assert.match(url.pathname, /\/oauth\/callback$/);
  assert.equal(url.searchParams.get("error"), "Authorization was cancelled.");
});

test("exchange returns needs_setup (invite required) when invite is missing", async () => {
  const code = exchangeCode({
    provider: "google",
    id: "gid_nope",
    email: "sso_needinvite@test.local",
    emailVerified: true,
    name: "Needs Invite",
    avatar: null,
    mode: "signup",
    invite: undefined,
  });
  const { status, body } = await request("/api/auth/oauth/exchange", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
  assert.equal(status, 200);
  assert.equal(body.data.status, "needs_setup");
  assert.equal(body.data.requiresInvite, true);
  assert.equal(body.data.requiresEmail, false);
  assert.equal(body.data.suggestedUsername, "sso_needinvite");
});

test("exchange returns needs_setup (email required) when the provider has no email", async () => {
  const code = exchangeCode({
    provider: "google",
    id: "gid_noemail",
    email: null,
    emailVerified: false,
    name: "No Email",
    avatar: null,
    mode: "signup",
    invite: undefined,
  });
  const { status, body } = await request("/api/auth/oauth/exchange", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
  assert.equal(status, 200);
  assert.equal(body.data.status, "needs_setup");
  assert.equal(body.data.requiresEmail, true);
  assert.equal(body.data.requiresInvite, true);
});

test("signup completes the setup with an invite and links the provider", async () => {
  const referrer = await mkUser("sso_ref_s");
  const invite = await mkInvite(referrer.id);
  const token = signupToken({
    provider: "google",
    id: "gid_complete",
    email: "sso_completed@test.local",
    emailVerified: true,
    name: "Completed",
    avatar: null,
    invite: invite.code,
  });
  const { status, body } = await request("/api/auth/oauth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Forwarded-For": "10.20.0.2", "User-Agent": "oauth-test-signup-complete" },
    body: JSON.stringify({ signupToken: token, username: "sso_completed", email: "sso_completed@test.local", inviteCode: invite.code }),
  });
  assert.equal(status, 201, JSON.stringify(body));
  assert.equal(body.success, true);
  assert.equal(body.data.user.username, "sso_completed");

  const user = await prisma.user.findUnique({ where: { username: "sso_completed" } });
  assert.ok(user);
  const linked = await prisma.oAuthAccount.findFirst({ where: { userId: user!.id } });
  assert.equal(linked!.providerAccountId, "gid_complete");
  const consumed = await prisma.inviteCode.findUnique({ where: { id: invite.id } });
  assert.equal(consumed!.usedById, user!.id);
});

test("signup requires an invite when the invite-gate is on", async () => {
  const token = signupToken({
    provider: "google",
    id: "gid_noinv",
    email: "sso_noinv@test.local",
    emailVerified: true,
    name: "No Inv",
    avatar: null,
  });
  const { status, body } = await request("/api/auth/oauth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ signupToken: token, username: "sso_noinv", email: "sso_noinv@test.local" }),
  });
  assert.equal(status, 400);
  assert.equal(body.success, false);
  assert.ok(body.fieldErrors?.inviteCode);
});

test("signup rejects reserved usernames (route collisions)", async () => {
  const token = signupToken({
    provider: "google",
    id: "gid_reserved",
    email: "sso_reserved@test.local",
    emailVerified: true,
    name: "Reserved",
    avatar: null,
    invite: "sso_reserved_invite",
  });
  const { status, body } = await request("/api/auth/oauth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Forwarded-For": "10.20.0.7", "User-Agent": "oauth-test-reserved" },
    body: JSON.stringify({ signupToken: token, username: "oauth", email: "sso_reserved@test.local", inviteCode: "sso_reserved_invite" }),
  });
  assert.equal(status, 400);
  assert.match(String(body.fieldErrors?.username), /reserved/i);
});

test("existing linked account with 2FA requires the second step (bypass off)", async () => {
  const user = await mkUser("sso_2fa_user", { totp: true, bypass: false });
  await prisma.oAuthAccount.create({
    data: { userId: user.id, provider: "google", providerAccountId: "gid_2fa" },
  });
  const code = exchangeCode({
    provider: "google",
    id: "gid_2fa",
    email: "sso_2fa_user@test.local",
    emailVerified: true,
    name: "2FA User",
    avatar: null,
    mode: "login",
    invite: undefined,
  });
  const { status, body } = await request("/api/auth/oauth/exchange", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
  assert.equal(status, 200);
  assert.equal(body.data.status, "needs_two_factor");
  assert.equal(body.data.methods.totp, true);
  assert.ok(body.data.twoFactorToken);
});

test("existing linked account with 2FA skips it when the user allowed SSO bypass", async () => {
  const user = await mkUser("sso_bypass_user", { totp: true, bypass: true });
  await prisma.oAuthAccount.create({
    data: { userId: user.id, provider: "google", providerAccountId: "gid_bypass" },
  });
  const code = exchangeCode({
    provider: "google",
    id: "gid_bypass",
    email: "sso_bypass_user@test.local",
    emailVerified: true,
    name: "Bypass User",
    avatar: null,
    mode: "login",
    invite: undefined,
  });
  const { status, body } = await request("/api/auth/oauth/exchange", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
  assert.equal(status, 200);
  assert.equal(body.data.status, "logged_in");
  assert.ok(body.data.token);
});

test("accounts list reports linked providers and the user's bypass flag", async () => {
  const user = await mkUser("sso_accounts_user", { bypass: true });
  await prisma.oAuthAccount.create({
    data: { userId: user.id, provider: "google", providerAccountId: "gid_list", email: "sso_accounts_user@test.local" },
  });
  const token = signAuth(user.id);
  const { status, body } = await request("/api/auth/oauth/accounts", {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(status, 200);
  assert.equal(body.data.oauthBypass2fa, true);
  assert.equal(body.data.twoFactorBypassAllowed, true);
  assert.equal(body.data.accounts.length, 1);
  assert.equal(body.data.accounts[0].provider, "google");
  assert.equal(body.data.authMethods.oauth, 1);
  assert.equal(body.data.authMethods.password, true);
});

test("unlink removes a provider", async () => {
  const user = await mkUser("sso_unlink_user");
  const linked = await prisma.oAuthAccount.create({
    data: { userId: user.id, provider: "google", providerAccountId: "gid_unlink" },
  });
  const token = signAuth(user.id);
  const del = await request(`/api/auth/oauth/accounts/google/gid_unlink`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(del.status, 200, JSON.stringify(del.body));
  assert.equal(del.body.data.removed, true);
  const gone = await prisma.oAuthAccount.findUnique({ where: { id: linked.id } });
  assert.equal(gone, null);
});

test("settings toggle requires the instance flag (allowed here) and persists", async () => {
  const user = await mkUser("sso_settings_user");
  const token = signAuth(user.id);
  const { status, body } = await request("/api/auth/oauth/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ oauthBypass2fa: true }),
  });
  assert.equal(status, 200);
  assert.equal(body.data.oauthBypass2fa, true);
  const after = await prisma.user.findUnique({ where: { id: user.id } });
  assert.equal(after!.oauthBypass2fa, true);
});

test("signup stores a self-typed email as UNVERIFIED, issues no session (A3a)", async () => {
  const referrer = await mkUser("sso_ref_typed");
  const invite = await mkInvite(referrer.id);
  const token = signupToken({
    provider: "google",
    id: "gid_typed_a",
    email: "sso_typed_provider@test.local",
    emailVerified: true,
    name: "Typed A",
    avatar: null,
    invite: invite.code,
  });
  const { status, body } = await request("/api/auth/oauth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Forwarded-For": "10.20.0.30", "User-Agent": "oauth-test-typed" },
    body: JSON.stringify({ signupToken: token, username: "sso_typed_a", email: "sso_typed_a@user.local", inviteCode: invite.code }),
  });
  // The provider verified ITS email (sso_typed_provider@test.local) but the
  // account was created with a DIFFERENT self-typed address. That address must
  // never become a usable identity: no token, no session.
  assert.equal(status, 201, JSON.stringify(body));
  assert.equal(body.success, true);
  assert.equal(body.data.status, "verification_required");
  assert.equal(body.data.token, undefined, "an unverified typed-email account must not receive a session");
  assert.equal(typeof body.data.emailSent, "boolean");

  const user = await prisma.user.findUnique({ where: { username: "sso_typed_a" } });
  assert.ok(user);
  assert.equal(user!.email, "sso_typed_a@user.local");
  assert.equal(user!.emailVerified, false);
  assert.equal(user!.emailVerifiedAt, null);
  const linked = await prisma.oAuthAccount.findFirst({ where: { userId: user!.id } });
  assert.equal(linked!.providerAccountId, "gid_typed_a");
  assert.equal(linked!.emailVerified, false);
});

test("exchange auto-verifies an UNVERIFIED account matched by a provider-verified email (A3a)", async () => {
  // Simulates the leftover from an earlier typed-email signup: the account's
  // email has never been confirmed (emailVerified false, no link on this
  // provider identity yet).
  const user = await prisma.user.create({
    data: {
      acceptedTosVersion: POLICY_VERSIONS.tos,
      acceptedPrivacyVersion: POLICY_VERSIONS.privacy,
      acceptedPoliciesAt: new Date(),
      username: "sso_verify_b",
      email: "sso_verify_b@typed.local",
      emailVerified: false,
      passwordHash: "not-a-real-hash",
      roleId,
      oauthBypass2fa: false,
    },
  });
  const code = exchangeCode({
    provider: "google",
    id: "gid_verify_b",
    email: "sso_verify_b@typed.local",
    emailVerified: true,
    name: "Verify B",
    avatar: null,
    mode: "login",
    invite: undefined,
  });
  const { status, body } = await request("/api/auth/oauth/exchange", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Forwarded-For": "10.20.0.31", "User-Agent": "oauth-test-verify-b" },
    body: JSON.stringify({ code }),
  });
  // A provider-verified identity controlling the SAME email as the unverified
  // account IS the double opt-in: the caller demonstrated mailbox control. This
  // is the one carve-out from A2 (which still blocks auto-linking to a
  // VERIFIED account).
  assert.equal(status, 200, JSON.stringify(body));
  assert.equal(body.data.status, "logged_in");
  assert.ok(body.data.token);

  const after = await prisma.user.findUnique({ where: { id: user.id } });
  assert.equal(after!.emailVerified, true);
  assert.ok(after!.emailVerifiedAt);
  const linked = await prisma.oAuthAccount.findFirst({ where: { userId: user.id } });
  assert.equal(linked!.providerAccountId, "gid_verify_b");
  assert.equal(linked!.emailVerified, true);
});