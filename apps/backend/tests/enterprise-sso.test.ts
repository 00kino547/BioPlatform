import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import type { Server } from "node:http";
import crypto from "node:crypto";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { SignJWT } from "jose";
import app from "../src/app.js";
import { getEnv } from "../src/config/env.js";
import { prisma } from "../src/lib/prisma.js";

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

const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
let latestJwks: Record<string, unknown> = {};
let latestIdToken = "not-set";
const latestProfile: Record<string, unknown> = {};

function installOidcMock() {
  globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
    const u = String(url);
    if (u.endsWith("/.well-known/openid-configuration")) {
      return jsonResponse({
        issuer: "https://idp.test",
        authorization_endpoint: "https://idp.test/authorize",
        token_endpoint: "https://idp.test/token",
        jwks_uri: "https://idp.test/jwks",
        userinfo_endpoint: "https://idp.test/userinfo",
      });
    }
    if (u === "https://idp.test/token") {
      return jsonResponse({ access_token: "at123", id_token: latestIdToken });
    }
    if (u === "https://idp.test/jwks") {
      return jsonResponse(latestJwks);
    }
    if (u === "https://idp.test/userinfo") {
      return jsonResponse(latestProfile);
    }
    return ORIGINAL_FETCH(url, init);
  }) as typeof fetch;
}

async function mintIdToken(claims: Record<string, unknown>) {
  return new SignJWT(claims as import("jose").JWTPayload)
    .setProtectedHeader({ alg: "RS256", kid: "test-key" })
    .setIssuer("https://idp.test")
    .setAudience("sso-client")
    .setSubject(claims.sub as string)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(privateKey);
}

let jwksLoaded = false;

async function ensureJwks() {
  if (jwksLoaded) return;
  const jwk = await (await import("jose")).exportJWK(publicKey);
  latestJwks = { keys: [{ ...jwk, kid: "test-key", use: "sig" }] };
  jwksLoaded = true;
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

async function mkUser(username: string, opts: { tier?: string; password?: string } = {}) {
  return prisma.user.create({
    data: {
      username,
      email: `${username}@test.local`,
      passwordHash: opts.password ? await bcrypt.hash(opts.password, 12) : "not-a-real-hash",
      roleId,
      tier: (opts.tier ?? "FREE") as "FREE" | "PRO" | "ENTERPRISE",
    },
  });
}

before(async () => {
  await prisma.enterpriseSsoIdentity.deleteMany();
  await prisma.enterpriseSso.deleteMany();
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
  await prisma.role.create({ data: { name: "User", slug: "user", permissions: [] } });
  const role = await prisma.role.create({
    data: { name: "Enterprise Sso Test", slug: "enterprise_sso_test", permissions: [] },
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
  await prisma.enterpriseSsoIdentity.deleteMany();
  await prisma.enterpriseSso.deleteMany();
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

async function cleanSso() {
  await prisma.enterpriseSsoIdentity.deleteMany();
  await prisma.enterpriseSso.deleteMany();
}

test("config CRUD requires enterprise tier and stores the secret encrypted", async () => {
  await cleanSso();
  const free = await mkUser("sso_free_user");
  await prisma.user.update({ where: { id: free.id }, data: { tier: "FREE" } });
  const auth = { Authorization: `Bearer ${signAuth(free.id)}` };

  const denied = await request("/api/auth/sso/config", { headers: auth });
  assert.equal(denied.status, 403);

  const owner = await mkUser("sso_owner_user", { tier: "ENTERPRISE" });
  const ownerAuth = { Authorization: `Bearer ${signAuth(owner.id)}` };

  const missing = await request("/api/auth/sso/config", { headers: ownerAuth, method: "PUT", body: "{}", headers: { ...ownerAuth, "Content-Type": "application/json" } });
  assert.equal(missing.status, 400);

  const blankName = await request("/api/auth/sso/config", {
    method: "PUT",
    headers: { ...ownerAuth, "Content-Type": "application/json" },
    body: JSON.stringify({ issuerUrl: "https://idp.test", clientId: "sso-client", clientSecret: "x", displayName: "   " }),
  });
  assert.equal(blankName.status, 400);

  const created = await request("/api/auth/sso/config", {
    method: "PUT",
    headers: { ...ownerAuth, "Content-Type": "application/json" },
    body: JSON.stringify({
      issuerUrl: "https://idp.test",
      clientId: "sso-client",
      clientSecret: "super-secret-value",
      displayName: "Acme IdP",
    }),
  });
  assert.equal(created.status, 200);
  const stored = await prisma.enterpriseSso.findUnique({ where: { userId: owner.id } });
  assert.ok(stored);
  assert.notEqual(stored.clientSecret, "super-secret-value");
  assert.notEqual(stored.clientSecret, "not-a-real-hash");

  const config = await request("/api/auth/sso/config", { headers: ownerAuth });
  assert.equal(config.status, 200);
  const configData = config.body.data as Record<string, unknown>;
  assert.equal(configData.displayName, "Acme IdP");
  assert.notEqual(configData.clientSecretMasked, "super-secret-value");
  assert.ok((configData.clientSecretMasked as string).includes("…"));
  assert.ok((configData.clientSecretMasked as string).endsWith(stored.clientSecret.slice(-4)));

  const updated = await request("/api/auth/sso/config", {
    method: "PUT",
    headers: { ...ownerAuth, "Content-Type": "application/json" },
    body: JSON.stringify({ issuerUrl: "https://idp.test", clientId: "sso-client", displayName: "Acme IdP Two", clientSecret: "" }),
  });
  assert.equal(updated.status, 200);
  const afterUpdate = await prisma.enterpriseSso.findUnique({ where: { userId: owner.id } });
  assert.equal(afterUpdate!.clientSecret, stored.clientSecret);

  const removed = await request("/api/auth/sso/config", { headers: ownerAuth, method: "DELETE" });
  assert.equal(removed.status, 200);
  const gone = await prisma.enterpriseSso.findUnique({ where: { userId: owner.id } });
  assert.equal(gone, null);
});

test("enforced SSO blocks password login and social login for the owner", async () => {
  await cleanSso();
  const owner = await mkUser("sso_enforced_user", { tier: "ENTERPRISE", password: "pw-12345" });
  const ownerAuth = { Authorization: `Bearer ${signAuth(owner.id)}` };

  await request("/api/auth/sso/config", {
    method: "PUT",
    headers: { ...ownerAuth, "Content-Type": "application/json" },
    body: JSON.stringify({
      issuerUrl: "https://idp.test",
      clientId: "sso-client",
      clientSecret: "super-secret-value",
      displayName: "Acme IdP",
      enforced: true,
    }),
  });

  const login = await request("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier: "sso_enforced_user@test.local", password: "pw-12345" }),
  });
  assert.equal(login.status, 403);
  assert.match(String(login.body.error), /enterprise SSO/i);

  const socialPayload = {
        provider: "google",
        id: "ext-pub",
        email: "sso_enforced_user@test.local",
        emailVerified: true,
        name: "Enforced",
        mode: "login",
      };
      const socialToken = jwt.sign({ purpose: "oauth_exchange", ...socialPayload }, getEnv().JWT_SECRET, { expiresIn: "10m" });
      const social = await request("/api/auth/oauth/exchange", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      code: socialToken,
    }),
  });
  assert.equal(social.status, 403);
  assert.match(String(social.body.error), /enterprise SSO/i);
});

test("full OIDC login links a matching verified email to the existing account", async () => {
  await ensureJwks();
  await cleanSso();
  installOidcMock();
  const existing = await mkUser("sso_oidc_user");
  const owner = await mkUser("sso_oidc_owner", { tier: "ENTERPRISE" });
  const ownerAuth = { Authorization: `Bearer ${signAuth(owner.id)}` };

  await request("/api/auth/sso/config", {
    method: "PUT",
    headers: { ...ownerAuth, "Content-Type": "application/json" },
    body: JSON.stringify({
      issuerUrl: "https://idp.test",
      clientId: "sso-client",
      clientSecret: "super-secret-value",
      displayName: "Acme IdP",
      enabled: true,
    }),
  });
  const publicList = await request("/api/auth/sso/configs");
  assert.equal(publicList.status, 200);
  const publicListData = publicList.body.data as Record<string, unknown>[];
  assert.equal(publicListData.length, 1);
  assert.equal(publicListData[0].displayName, "Acme IdP");

  const start = await request("/api/auth/sso/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ configId: publicListData[0].id }),
  });
  assert.equal(start.status, 200);
  const startData = start.body.data as Record<string, unknown>;
  const authorizeUrl = new URL(startData.redirectUrl as string);
  assert.equal(authorizeUrl.host, "idp.test");
  assert.equal(authorizeUrl.searchParams.get("client_id"), "sso-client");
  assert.equal(authorizeUrl.searchParams.get("code_challenge_method"), "S256");
  const state = authorizeUrl.searchParams.get("state")!;
  assert.ok(state);

  latestIdToken = await mintIdToken({
    sub: "oidc-sub-1",
    email: "sso_oidc_user@test.local",
    email_verified: true,
    name: "OIDC User",
  });

  const cb = await request(
    `/api/auth/sso/callback?code=pc&state=${encodeURIComponent(state)}`,
    { headers: { Cookie: `sso_state=${encodeURIComponent(state)}` }, redirect: "manual" }
  );
  assert.equal(cb.status, 302);
  const loc = new URL(cb.headers.get("location")!);
  assert.equal(loc.pathname, "/sso/callback");

  const code = loc.searchParams.get("code")!;
  assert.ok(code);
  const exchange = await request("/api/auth/sso/exchange", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
  assert.equal(exchange.status, 200);
  const exchangeData = exchange.body.data as Record<string, unknown>;
  const exchangeUser = exchangeData.user as Record<string, unknown>;
  assert.equal(exchangeData.status, "logged_in");
  assert.equal(exchangeUser.id, existing.id);

  const identity = await prisma.enterpriseSsoIdentity.findUnique({
    where: { ssoId_providerAccountId: { ssoId: publicListData[0].id, providerAccountId: "oidc-sub-1" } },
  });
  assert.ok(identity);
  assert.equal(identity.userId, existing.id);
});

test("domain-restricted SSO rejects emails outside allowedDomains", async () => {
  await cleanSso();
  installOidcMock();
  const owner = await mkUser("sso_domain_owner", { tier: "ENTERPRISE" });
  const ownerAuth = { Authorization: `Bearer ${signAuth(owner.id)}` };
  await request("/api/auth/sso/config", {
    method: "PUT",
    headers: { ...ownerAuth, "Content-Type": "application/json" },
    body: JSON.stringify({
      issuerUrl: "https://idp.test",
      clientId: "sso-client",
      clientSecret: "super-secret-value",
      displayName: "Domain IdP",
      allowedDomains: "allowed.com",
    }),
  });

  const publicList = await request("/api/auth/sso/configs");
  const publicListData = publicList.body.data as Record<string, unknown>[];
  const configId = publicListData[0].id;

  const start = await request("/api/auth/sso/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ configId }),
  });
  const startData = start.body.data as Record<string, unknown>;
  const state = new URL(startData.redirectUrl as string).searchParams.get("state")!;

  latestIdToken = await mintIdToken({
    sub: "oidc-sub-2",
    email: "nobody@evil.com",
    email_verified: true,
    name: "Intruder",
  });

  const cb = await request(
    `/api/auth/sso/callback?code=pc&state=${encodeURIComponent(state)}`,
    { headers: { Cookie: `sso_state=${encodeURIComponent(state)}` }, redirect: "manual" }
  );
  assert.equal(cb.status, 302);
  const loc = new URL(cb.headers.get("location")!);
  assert.match(String(loc.searchParams.get("error")), /not allowed/i);
});