// Operator auto-accept of the Terms / Privacy Policy.
//
// Context for why this exists: the consent gate (middleware/consent.ts) refuses
// every authenticated call until an account accepts the current POLICY_VERSIONS.
// That is right for customers, but it also locked the admin account out of the
// panel it administers for the full 30-day review window after every policy bump
// — found while verifying the paid-invite flow end to end, where the very first
// admin call returned `policies_outdated`.
//
// The rule these tests pin down:
//   - only accounts whose role slug is in POLICY_ADMIN_AUTO_ACCEPT_ROLES qualify
//     (default: the built-in `admin` role);
//   - only after the same 30-day window everyone else gets — never on the spot;
//   - the acceptance is WRITTEN to the user's row, with a marker saying the
//     platform recorded it rather than a person clicking accept.

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import jwt from "jsonwebtoken";
import app from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { getEnv, resetEnvForTests } from "../src/config/env.js";
import { POLICY_VERSIONS, deemedAcceptanceCutoff, policyEffectiveDate } from "../src/lib/newsletter.js";
import { readConsentState } from "../src/middleware/consent.js";

const ADMIN_ROLE = "polauto_admin";
const STAFF_ROLE = "polauto_staff";
const USER_PREFIX = "polauto_";

let server: Server;
let baseUrl = "";
let adminRoleId = "";
let staffRoleId = "";
let previousRoles: string | undefined;
const userIds: string[] = [];
const roleIds: string[] = [];

/** A date comfortably past the 30-day deemed-acceptance window for the live version. */
function afterWindow(): Date {
  return new Date(deemedAcceptanceCutoff(policyEffectiveDate()).getTime() + 86_400_000);
}

/** A date inside the window, i.e. what "today" looked like when this was found. */
function beforeWindow(): Date {
  return new Date(policyEffectiveDate().getTime() + 86_400_000);
}

async function newUser(suffix: string, roleId: string): Promise<string> {
  const user = await prisma.user.create({
    data: {
      username: `${USER_PREFIX}${suffix}`,
      email: `${USER_PREFIX}${suffix}@test.local`,
      passwordHash: "x",
      roleId,
      // Deliberately left NULL: this is the "never accepted" state the rule exists
      // for. `lastLoginAt` stays NULL too, so the ordinary consumer deemed-acceptance
      // path cannot make these users look current on its own.
    },
  });
  userIds.push(user.id);
  return user.id;
}

function signAuth(id: string): string {
  // `purpose: "auth"` is required by requireAuth — a token without it is rejected
  // as 401 before the consent gate is ever reached.
  return jwt.sign({ userId: id, purpose: "auth" }, getEnv().JWT_SECRET, { expiresIn: "10m" });
}

describe("operator auto-accept", () => {
  before(async () => {
    await prisma.user.deleteMany({ where: { username: { startsWith: USER_PREFIX } } });
    await prisma.role.deleteMany({ where: { slug: { startsWith: "polauto_" } } });

    const admin = await prisma.role.create({
      // invites.manage is what the assertion below actually needs; an admin role
      // without a usable permission would prove nothing.
      data: { name: "PolAuto Admin", slug: ADMIN_ROLE, permissions: ["invites.manage"] },
    });
    const staff = await prisma.role.create({
      data: { name: "PolAuto Staff", slug: STAFF_ROLE, permissions: ["users.view"] },
    });
    adminRoleId = admin.id;
    staffRoleId = staff.id;
    roleIds.push(admin.id, staff.id);

    // Point the allowlist at this suite's own throwaway roles. The shipped default
    // is `admin`, which no test user holds, so without this the positive cases would
    // quietly assert the negative path and pass for the wrong reason.
    previousRoles = process.env.POLICY_ADMIN_AUTO_ACCEPT_ROLES;
    process.env.POLICY_ADMIN_AUTO_ACCEPT_ROLES = `${ADMIN_ROLE}, admin`;
    resetEnvForTests();

    server = app.listen(0);
    await new Promise<void>((resolve) => server.once("listening", () => resolve()));
    const addr = server.address();
    baseUrl = typeof addr === "object" && addr ? `http://127.0.0.1:${addr.port}` : "";
  });

  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.role.deleteMany({ where: { id: { in: roleIds } } });
    if (previousRoles === undefined) delete process.env.POLICY_ADMIN_AUTO_ACCEPT_ROLES;
    else process.env.POLICY_ADMIN_AUTO_ACCEPT_ROLES = previousRoles;
    resetEnvForTests();
  });

  test("the allowlist and the switch are configurable", () => {
    // Guards the settings surface itself: both must be parseable and the switch
    // must default on, or every operator account silently goes back to being locked
    // out after the next policy bump.
    assert.equal(getEnv().POLICY_ADMIN_AUTO_ACCEPT, true);
    assert.ok(
      getEnv().POLICY_ADMIN_AUTO_ACCEPT_ROLES.includes(ADMIN_ROLE),
      "this suite's allowlisted role must be in the list",
    );
    assert.ok(
      !getEnv().POLICY_ADMIN_AUTO_ACCEPT_ROLES.split(",").some((s) => s.trim() === STAFF_ROLE),
      "the unlisted-role case requires the staff role to stay out",
    );
  });

  test("an allowlisted account is recorded once the review window has passed", async () => {
    const userId = await newUser("window_open", adminRoleId);

    const state = await readConsentState(userId, afterWindow());
    assert.equal(state.current, true, "the operator must not stay locked out");
    assert.equal(state.autoAccepted, true);
    assert.deepEqual(state.behind, { tos: false, privacy: false });

    // Not just an in-memory decision: the acceptance is a real row, so it is
    // auditable and survives the process that made it.
    const row = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        acceptedTosVersion: true,
        acceptedPrivacyVersion: true,
        acceptedPoliciesAt: true,
        policiesAutoAccepted: true,
      },
    });
    assert.equal(row.acceptedTosVersion, POLICY_VERSIONS.tos);
    assert.equal(row.acceptedPrivacyVersion, POLICY_VERSIONS.privacy);
    assert.ok(row.acceptedPoliciesAt, "the acceptance needs a timestamp");
    assert.equal(row.policiesAutoAccepted, true, "the record must say it was automatic");
  });

  test("it is not applied before the review window has passed", async () => {
    const userId = await newUser("window_closed", adminRoleId);

    const state = await readConsentState(userId, beforeWindow());
    assert.equal(state.current, false, "30 days of review means 30 days of blocking");
    assert.deepEqual(state.behind, { tos: true, privacy: true });

    const row = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    assert.equal(row.acceptedTosVersion, null, "nothing may be written before the window opens");
    assert.equal(row.policiesAutoAccepted, false);
  });

  test("a role outside the allowlist is never auto-accepted", async () => {
    // The allowlist is a deliberate operator choice; a role that is merely a role
    // must not inherit blanket legal acceptance.
    const userId = await newUser("not_listed", staffRoleId);

    const state = await readConsentState(userId, afterWindow());
    assert.equal(state.current, false);

    const row = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    assert.equal(row.acceptedTosVersion, null);
    assert.equal(row.policiesAutoAccepted, false);
  });

  test("disabling the rule stops it, even for an allowlisted role", async () => {
    const previous = process.env.POLICY_ADMIN_AUTO_ACCEPT;
    process.env.POLICY_ADMIN_AUTO_ACCEPT = "false";
    resetEnvForTests();
    try {
      const userId = await newUser("disabled", adminRoleId);
      const state = await readConsentState(userId, afterWindow());
      assert.equal(state.current, false, "POLICY_ADMIN_AUTO_ACCEPT=false must mean off");
      const row = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
      assert.equal(row.acceptedTosVersion, null);
    } finally {
      if (previous === undefined) delete process.env.POLICY_ADMIN_AUTO_ACCEPT;
      else process.env.POLICY_ADMIN_AUTO_ACCEPT = previous;
      resetEnvForTests();
    }
  });

  test("the gate and /me agree about an auto-accepted operator", async () => {
    // The whole point of routing /me through readConsentState: the SPA must not be
    // told "you are current" while the API is still refusing the account.
    const userId = await newUser("agreement", adminRoleId);
    await readConsentState(userId, afterWindow());

    const me = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${signAuth(userId)}` },
    });
    assert.equal(me.status, 200);
    const consent = (await me.json()).data.consent;
    assert.equal(consent.current, true);
    assert.equal(consent.autoAccepted, true);

    // And a real mutating admin call now goes through instead of 403-ing.
    const call = await fetch(`${baseUrl}/api/admin/invite-purchase-settings`, {
      headers: { Authorization: `Bearer ${signAuth(userId)}` },
    });
    assert.equal(call.status, 200, "the operator must be able to do their job");
  });

  test("a deliberate acceptance clears the automatic marker", async () => {
    // Otherwise an operator who clicks accept after being auto-accepted would keep
    // being reported as having never consented themselves.
    const userId = await newUser("deliberate", adminRoleId);
    await readConsentState(userId, afterWindow());

    const res = await fetch(`${baseUrl}/api/auth/accept-policies`, {
      method: "POST",
      headers: { Authorization: `Bearer ${signAuth(userId)}` },
    });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).data.autoAccepted, false);

    const row = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    assert.equal(row.policiesAutoAccepted, false);
  });
});