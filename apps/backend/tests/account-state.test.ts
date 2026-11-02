// Regression tests for the three account-state hardenings fixed alongside the
// deep route audit (owner asked for all three to be fixed now):
//
//   F22 — `disableAccount` (DMCA compliance lock) does not bump `authVersion`,
//         so previously issued JWTs stayed technically valid outside the
//         request-time `disabledAt` gates. It must increment `authVersion`,
//         which makes every issued token fail verification immediately — the
//         same mechanism a password change uses.
//
//   F23 — account deletion dispatched `user.deleted` twice: an awaited
//         pre-transaction dispatch (the one that works, the webhook endpoints
//         are cascade-deleted inside the transaction) and a dead post-commit
//         duplicate. The duplicate is removed; exactly one delivery row per
//         subscribed webhook must be created.
//
//   F10 — `getViewerId` (optional-auth profile routes) accepted a token with NO
//         purpose claim as a viewer (`purpose === undefined` passed the old
//         non-strict check). Only an `auth`-purpose token may count as viewer,
//         proven here through the private-profile click gate.
//
// Needs a Postgres at DATABASE_URL (tests/setup-env.ts).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import type { Server } from "node:http";
import jwt from "jsonwebtoken";
import app from "../src/app.js";
import { getEnv } from "../src/config/env.js";
import { prisma } from "../src/lib/prisma.js";
import { disableAccount } from "../src/lib/dmca.js";
import { deleteUserCompletely } from "../src/lib/accountDeletion.js";
import { encryptSecret } from "../src/lib/webhook.js";
import { POLICY_VERSIONS } from "../src/lib/newsletter.js";

const ROLE_SLUG = "account_state_admin";
const NAMES = ["state-user-disable", "state-user-delete", "state-user-click"];

let server: Server;
let baseUrl: string;
let roleId: string;

function signAuth(id: string): string {
  return jwt.sign({ userId: id, purpose: "auth" }, getEnv().JWT_SECRET, { expiresIn: "7d" });
}

function signTokenNoPurpose(id: string): string {
  return jwt.sign({ userId: id }, getEnv().JWT_SECRET, { expiresIn: "7d" });
}

async function cleanUp() {
  await prisma.webhook.deleteMany({ where: { user: { username: { startsWith: "state-user-" } } } });
  await prisma.linkClick.deleteMany({ where: { profile: { slug: { startsWith: "state-priv" } } } });
  await prisma.profile.deleteMany({ where: { slug: { startsWith: "state-priv" } } });
  await prisma.user.deleteMany({ where: { username: { in: NAMES } } });
  await prisma.role.deleteMany({ where: { slug: ROLE_SLUG } });
}

async function seedUser(username: string) {
  return prisma.user.create({
    data: {
      username,
      email: `${username}@test.local`,
      passwordHash: "not-a-real-hash",
      roleId,
      acceptedTosVersion: POLICY_VERSIONS.tos,
      acceptedPrivacyVersion: POLICY_VERSIONS.privacy,
      acceptedPoliciesAt: new Date(),
    },
  });
}

before(async () => {
  await cleanUp();
  const role = await prisma.role.create({
    data: { name: "State Admin", slug: ROLE_SLUG, permissions: ["orders.manage"] },
  });
  roleId = role.id;

  const r = app.listen(0);
  await once(r, "listening");
  server = r;
  const addr = r.address();
  baseUrl = typeof addr === "object" && addr ? `http://127.0.0.1:${addr.port}` : "";
});

after(async () => {
  await cleanUp();
  server?.close();
});

test("F22: disableAccount bumps authVersion so issued tokens die at once", async () => {
  const user = await seedUser("state-user-disable");
  const before = (await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { authVersion: true } })).authVersion;

  await disableAccount(user.id, "compliance");

  const afterRow = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  assert.equal(afterRow.authVersion, before + 1);
  assert.ok(afterRow.disabledAt);
  assert.equal(afterRow.disabledReason, "compliance");
});

test("F23: deleted account's user.deleted webhook is delivered exactly once", async () => {
  const user = await seedUser("state-user-delete");
  await prisma.webhook.create({
    data: {
      userId: user.id,
      name: "deletion watcher",
      url: "https://unreachable.invalid/hook",
      secretEncrypted: encryptSecret("test-secret"),
      secretPrefix: "ts_",
      active: true,
      events: ["user.deleted"],
    },
  });

  // Spy on delivery creation so the count survives the cascade deletion.
  let deliveriesCreated = 0;
  const delegate = prisma.webhookDelivery as unknown as {
    create: (args: unknown) => Promise<unknown>;
  };
  const originalCreate = delegate.create.bind(delegate);
  delegate.create = ((args: unknown) => {
    deliveriesCreated++;
    return originalCreate(args);
  }) as typeof delegate.create;

  try {
    await deleteUserCompletely(user.id, {});

    // The account and its webhook endpoints are gone...
    assert.equal(await prisma.user.findUnique({ where: { id: user.id } }), null);
    assert.equal(await prisma.webhook.count({ where: { userId: user.id } }), 0);
    // ...and exactly ONE user.deleted delivery row was created for the
    // subscribed webhook — never two (the old post-commit duplicate).
    assert.equal(deliveriesCreated, 1);
  } finally {
    delegate.create = originalCreate;
  }
});

test("F10: an auth-purpose token counts as viewer, a purpose-less token does not", async () => {
  const user = await seedUser("state-user-click");
  const profile = await prisma.profile.create({
    data: {
      userId: user.id,
      slug: "state-priv-click",
      isPrimary: true,
      isPublic: false,
      socialLinks: [{ platform: "github", url: "https://github.com/state-user-click" }],
    },
  });

  async function click(bearer?: string) {
    const res = await fetch(`${baseUrl}/api/profiles/click`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) },
      body: JSON.stringify({ profileId: profile.id, platform: "github" }),
    });
    return res.status;
  }

  // Owner with an auth-purpose token: the private-profile gate passes.
  assert.equal(await click(signAuth(user.id)), 200);
  // Same principal, but WITHOUT a purpose claim: the old check honoured it,
  // the strict check treats it as an anonymous visitor → 404.
  assert.equal(await click(signTokenNoPurpose(user.id)), 404);
  // No token at all: anonymous visitor → 404.
  assert.equal(await click(), 404);
});
