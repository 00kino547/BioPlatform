import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import type { Server } from "node:http";
import bcrypt from "bcrypt";
import app from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { POLICY_VERSIONS } from "../src/lib/newsletter.js";
import { resetAuthGuardSubthresholds } from "../src/lib/authGuard.js";

// The disabled-account gate is a security control with two failure modes that
// both fail OPEN in the wrong direction:
//
//   1. Too narrow — a disabled account keeps editing its profile while a
//      copyright claim is under review.
//   2. Too wide, or in the wrong ORDER — the appeal surface becomes
//      unreachable. The policy re-consent bump shipped alongside this feature,
//      so a disabled account is normally also consent-outdated; if the consent
//      gate ran first it would answer 403 `policies_outdated` and mask the one
//      code the SPA needs to route the user to /account/disabled.
//
// Both are pinned here, plus the two properties that make the 423 survivable:
// the response carries a working session token (the appeal is an authenticated
// call) and `/me` reports the disabled state so the SPA can render the screen.
describe("DMCA disabled-account gate", () => {
  let server: Server;
  let baseUrl: string;
  let roleId = "";
  let activeId = "";
  let disabledId = "";

  const PASSWORD = "gate-test-passw0rd";

  /** The disabled/appeal state `/me` reports for the SPA to render. */
  interface DisabledState {
    disabled: boolean;
    disabledAt?: string | null;
    disabledReason?: string | null;
    appealSubmittedAt?: string | null;
    appealText?: string | null;
  }

  /** Envelope of the auth responses these assertions read. */
  interface AuthBody {
    success?: boolean;
    code?: string;
    error?: string;
    appealUrl?: string;
    disabledAt?: string;
    disabledReason?: string;
    data?: {
      token?: string;
      disabled?: DisabledState;
      [key: string]: unknown;
    };
  }

  async function request(path: string, init: RequestInit = {}) {
    const res = await fetch(`${baseUrl}${path}`, init);
    const body = (await res.json().catch(() => null)) ?? {};
    return { status: res.status, body: body as AuthBody };
  }

  function auth(token: string): Record<string, string> {
    return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  }

  /** Signs a token directly so a test does not depend on the login route. */
  function signFor(userId: string): Promise<string> {
    // Imported lazily to keep the module graph at the top of the file small.
    return import("jsonwebtoken").then(({ default: jwt }) =>
      import("../src/config/env.js").then(({ getEnv }) =>
        jwt.sign({ userId, purpose: "auth", av: 0 }, getEnv().JWT_SECRET, { expiresIn: "1h" })
      )
    );
  }

  async function createUser(opts: {
    username: string;
    disabledAt?: Date | null;
    acceptedTos?: string | null;
    acceptedPrivacy?: string | null;
  }) {
    const user = await prisma.user.create({
      data: {
        username: opts.username,
        email: `${opts.username}@dmca-gate.test`,
        emailVerified: true,
        emailVerifiedAt: new Date(),
        passwordHash: await bcrypt.hash(PASSWORD, 12),
        roleId,
        disabledAt: opts.disabledAt ?? null,
        disabledReason: opts.disabledAt ? "dmca" : null,
        acceptedTosVersion: opts.acceptedTos ?? POLICY_VERSIONS.tos,
        acceptedPrivacyVersion: opts.acceptedPrivacy ?? POLICY_VERSIONS.privacy,
        acceptedPoliciesAt: new Date(),
      },
    });
    return user;
  }

  before(async () => {
    await prisma.user.deleteMany({ where: { email: { endsWith: "@dmca-gate.test" } } });
    await prisma.role.deleteMany({ where: { slug: "dmca_gate_user" } });
    // Test isolation: another file in the same suite/process may have left a
    // lockout behind, which would turn these assertions into 403s.
    await prisma.authBan.deleteMany();
    await prisma.authLog.deleteMany();
    resetAuthGuardSubthresholds();

    const role = await prisma.role.create({
      data: { name: "DMCA Gate User", slug: "dmca_gate_user", permissions: [] },
    });
    roleId = role.id;

    activeId = (await createUser({ username: "dmca_gate_active" })).id;
    disabledId = (await createUser({ username: "dmca_gate_disabled", disabledAt: new Date() })).id;

    server = app.listen(0);
    await once(server, "listening");
    baseUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  });

  after(async () => {
    server.close();
    await once(server, "close");
    await prisma.user.deleteMany({ where: { email: { endsWith: "@dmca-gate.test" } } });
    await prisma.role.deleteMany({ where: { slug: "dmca_gate_user" } });
  });

  test("a disabled account is rejected with 423 + account_disabled on a normal route", async () => {
    const res = await request("/api/profiles/me", {
      headers: auth(await signFor(disabledId)),
    });
    assert.equal(res.status, 423, JSON.stringify(res.body));
    assert.equal(res.body.code, "account_disabled");
    assert.equal(res.body.success, false);
    assert.match(String(res.body.appealUrl), /\/account\/disabled$/);
    assert.ok(res.body.disabledAt, "the response must say when the account was disabled");
  });

  test("/me is exempt and reports the disabled state the SPA renders", async () => {
    const res = await request("/api/auth/me", { headers: auth(await signFor(disabledId)) });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.data?.disabled?.disabled, true);
    assert.equal(res.body.data?.disabled?.disabledReason, "dmca");
    assert.ok(res.body.data?.disabled?.disabledAt);
    assert.equal(res.body.data?.disabled?.appealSubmittedAt, null, "no appeal filed yet");
  });

  test("/me reports disabled:false for a healthy account", async () => {
    const res = await request("/api/auth/me", { headers: auth(await signFor(activeId)) });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.data?.disabled?.disabled, false);
  });

  test("credential-security routes stay reachable for a disabled account", async () => {
    const token = await signFor(disabledId);

    // GET /passkeys is under the exempt prefix. It must answer 200 with the
    // account's (empty) list rather than 423.
    const passkeys = await request("/api/auth/passkeys", { headers: auth(token) });
    assert.notEqual(passkeys.status, 423, JSON.stringify(passkeys.body));
    assert.equal(passkeys.status, 200, JSON.stringify(passkeys.body));

    // change-password is exempt, so it fails on validation (no body) — never 423.
    const change = await request("/api/auth/change-password", { method: "POST", headers: auth(token) });
    assert.notEqual(change.status, 423, JSON.stringify(change.body));
  });

  test("profile, shop and admin routes stay blocked for a disabled account", async () => {
    const token = await signFor(disabledId);
    const blocked: Array<[string, RequestInit]> = [
      ["/api/profiles/me", { method: "GET" }],
      ["/api/music/me", { method: "GET" }],
      ["/api/admin/users", { method: "GET" }],
    ];
    for (const [path, init] of blocked) {
      const res = await request(path, { ...init, headers: auth(token) });
      assert.equal(res.status, 423, `${path} must be 423, got ${res.status} ${JSON.stringify(res.body)}`);
      assert.equal(res.body.code, "account_disabled");
    }
  });

  test("login rejects a disabled account with 423, the appeal hint AND a token", async () => {
    const res = await request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: "dmca_gate_disabled", password: PASSWORD }),
    });

    assert.equal(res.status, 423, JSON.stringify(res.body));
    assert.equal(res.body.code, "account_disabled");
    assert.match(String(res.body.appealUrl), /\/account\/disabled$/);

    // The token is what makes the appeal reachable: without it the 423 would
    // point at a page the claimant cannot use.
    const token = res.body.data?.token;
    assert.ok(token, "423 login must still hand back a session token");

    // ...and that token must open exactly the escape hatch, nothing more.
    const me = await request("/api/auth/me", { headers: auth(token) });
    assert.equal(me.status, 200, JSON.stringify(me.body));
    assert.equal(me.body.data?.disabled?.disabled, true);

    const blocked = await request("/api/profiles/me", { headers: auth(token) });
    assert.equal(blocked.status, 423, "the returned token must not unlock ordinary routes");
    assert.equal(blocked.body.code, "account_disabled");
  });

  test("login still works normally for a healthy account", async () => {
    const res = await request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: "dmca_gate_active", password: PASSWORD }),
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.ok(res.body.data?.token);
    assert.notEqual(res.body.code, "account_disabled");
  });

  test("login still refuses a wrong password on a disabled account", async () => {
    // Ordering regression guard: the disabled check must not run before the
    // password check, or the response becomes an account-status oracle.
    const res = await request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: "dmca_gate_disabled", password: "definitely-wrong" }),
    });
    assert.equal(res.status, 401, JSON.stringify(res.body));
    assert.equal(res.body.error, "Invalid credentials");
    assert.notEqual(res.body.code, "account_disabled");
  });

  test("disabled WINS over consent-outdated: 423, never 403 policies_outdated", async () => {
    // Both gates apply to this account. The disabled gate must answer first so
    // the SPA is not told to accept policies it cannot act on.
    const stale = await createUser({
      username: "dmca_gate_stale",
      disabledAt: new Date(),
      acceptedTos: "2020-01-01",
      acceptedPrivacy: "2020-01-01",
    });
    try {
      const res = await request("/api/profiles/me", { headers: auth(await signFor(stale.id)) });
      assert.equal(res.status, 423, JSON.stringify(res.body));
      assert.equal(res.body.code, "account_disabled");
      assert.notEqual(res.body.code, "policies_outdated");
    } finally {
      await prisma.user.delete({ where: { id: stale.id } }).catch(() => undefined);
    }
  });

  test("consent-outdated WITHOUT a disable still gets 403 policies_outdated", async () => {
    // Proves the disabled gate did not displace the consent gate.
    const stale = await createUser({
      username: "dmca_gate_consent_only",
      acceptedTos: "2020-01-01",
      acceptedPrivacy: "2020-01-01",
    });
    try {
      const res = await request("/api/profiles/me", { headers: auth(await signFor(stale.id)) });
      assert.equal(res.status, 403, JSON.stringify(res.body));
      assert.equal(res.body.code, "policies_outdated");
    } finally {
      await prisma.user.delete({ where: { id: stale.id } }).catch(() => undefined);
    }
  });

  test("an expired or forged token is still 401, not 423", async () => {
    const res = await request("/api/profiles/me", { headers: auth("not-a-real-token") });
    assert.equal(res.status, 401);
    assert.equal(res.body.error, "Invalid token");
  });
});
