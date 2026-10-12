import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import type { Server } from "node:http";
import jwt from "jsonwebtoken";
import app from "../src/app.js";
import { getEnv } from "../src/config/env.js";
import { prisma } from "../src/lib/prisma.js";
import { POLICY_VERSIONS } from "../src/lib/newsletter.js";

// DB-backed route tests for the instance-ads opt-out (Profile.hideAds) and the
// `ad:<network>` click pipeline (FOLLOW-UP 3). Requires the test schema
// (bioplatform_test) with the add-on migration applied — run the backend suite
// against a real Postgres as usual.

let server: Server;
let baseUrl: string;
let roleId: string;

async function request(
  path: string,
  init: RequestInit = {}
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetch(`${baseUrl}${path}`, init);
  const body = (await res.json().catch(() => null)) ?? {};
  return { status: res.status, body };
}

function authHeaders(userId: string) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${jwt.sign({ userId, purpose: "auth" }, getEnv().JWT_SECRET, { expiresIn: "7d" })}`,
  };
}

async function makeUser(prefix: string, tier: "FREE" | "PRO") {
  const stamp = Date.now() + Math.random().toString(36).slice(2, 7);
  return prisma.user.create({
    data: {
      tier,
      acceptedTosVersion: POLICY_VERSIONS.tos,
      acceptedPrivacyVersion: POLICY_VERSIONS.privacy,
      acceptedPoliciesAt: new Date(),
      username: `${prefix}_${stamp}`,
      email: `${prefix}_${stamp}@test.local`,
      passwordHash: "not-a-real-hash",
      roleId,
    },
  });
}

before(async () => {
  await prisma.linkClick.deleteMany();
  await prisma.profile.deleteMany();
  await prisma.user.deleteMany();
  await prisma.role.deleteMany();
  await prisma.role.create({ data: { name: "User", slug: "user", permissions: [] } });
  const role = await prisma.role.findUnique({ where: { slug: "user" } });
  if (!role) throw new Error("setup failed");
  roleId = role.id;

  server = app.listen(0);
  await once(server, "listening");
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("no listening address");
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

after(async () => {
  server?.close();
  await prisma.linkClick.deleteMany();
  await prisma.profile.deleteMany();
  await prisma.user.deleteMany();
  await prisma.role.deleteMany();
});

test("FREE tier cannot opt out of instance ads when the operator has not granted it", async () => {
  const free = await makeUser("freeuser", "FREE");
  const headers = authHeaders(free.id);

  const res = await request("/api/profiles/me", {
    method: "PUT",
    headers,
    body: JSON.stringify({ displayName: "Free Person", hideAds: true }),
  });
  assert.equal(res.status, 403);
  assert.ok(String(res.body?.error).includes("Upgrade") || String(res.body?.error).includes("PRO"));
});

test("PRO tier can always opt out; the flag persists on the public profile", async () => {
  const pro = await makeUser("prouser", "PRO");
  const headers = authHeaders(pro.id);

  const first = await request("/api/profiles/me", {
    method: "PUT",
    headers,
    body: JSON.stringify({ displayName: "Pro Person", bio: "paid", hideAds: true }),
  });
  assert.equal(first.status, 200);
  assert.equal((first.body?.data as Record<string, unknown> | undefined)?.hideAds, true);

  // Public profile payload carries hideAds so the frontend skips ad slots.
  const ownerSlug = (first.body?.data as Record<string, unknown> | undefined)?.slug as string;
  const publicBody = await fetch(`${baseUrl}/api/profiles/${ownerSlug}`, {
    headers: { Accept: "application/json" },
  }).then((r) => r.json());
  assert.equal(publicBody.success, true);
  assert.equal((publicBody.data as Record<string, unknown> | undefined)?.hideAds, true);

  // Turning it back off (setting false) is always allowed.
  const off = await request("/api/profiles/me", {
    method: "PUT",
    headers,
    body: JSON.stringify({ hideAds: false }),
  });
  assert.equal(off.status, 200);
  assert.equal((off.body?.data as Record<string, unknown> | undefined)?.hideAds, false);
});

test("adblock-notice gate: FREE always has it on and cannot turn it off; PRO may disable it", async () => {
  // FREE default is on, and the public payload advertises it so the frontend
  // mounts the detector whenever instance ads render.
  const free = await makeUser("notiuser", "FREE");
  const freeHeaders = authHeaders(free.id);
  const created = await request("/api/profiles/me", {
    method: "PUT",
    headers: freeHeaders,
    body: JSON.stringify({ displayName: "Notice Free" }),
  });
  assert.equal(created.status, 200);
  const freeSlug = (created.body?.data as Record<string, unknown> | undefined)?.slug as string;

  // FREE may not request disable() — the gate rejects the entire update.
  const denied = await request("/api/profiles/me", {
    method: "PUT",
    headers: freeHeaders,
    body: JSON.stringify({ adblockDetectorEnabled: false }),
  });
  assert.equal(denied.status, 403);
  assert.ok(String(denied.body?.error).includes("PRO"));

  const publicFree = await fetch(`${baseUrl}/api/profiles/${freeSlug}`, {
    headers: { Accept: "application/json" },
  }).then((r) => r.json());
  assert.equal(publicFree.success, true);
  assert.equal((publicFree.data as Record<string, unknown> | undefined)?.adblockDetectorEnabled, true);

  // FREE may still toggle to true (no-op) — only false is gated.
  const keepOn = await request("/api/profiles/me", {
    method: "PUT",
    headers: freeHeaders,
    body: JSON.stringify({ adblockDetectorEnabled: true }),
  });
  assert.equal(keepOn.status, 200);

  // PRO: default on, but disable works and the public profile reflects it.
  const pro = await makeUser("noticpro", "PRO");
  const proHeaders = authHeaders(pro.id);
  const proCreated = await request("/api/profiles/me", {
    method: "PUT",
    headers: proHeaders,
    body: JSON.stringify({ displayName: "Notice Pro" }),
  });
  assert.equal(proCreated.status, 200);
  const proSlug = (proCreated.body?.data as Record<string, unknown> | undefined)?.slug as string;

  const off = await request("/api/profiles/me", {
    method: "PUT",
    headers: proHeaders,
    body: JSON.stringify({ adblockDetectorEnabled: false }),
  });
  assert.equal(off.status, 200);
  assert.equal((off.body?.data as Record<string, unknown> | undefined)?.adblockDetectorEnabled, false);

  const publicPro = await fetch(`${baseUrl}/api/profiles/${proSlug}`, {
    headers: { Accept: "application/json" },
  }).then((r) => r.json());
  assert.equal(publicPro.success, true);
  assert.equal((publicPro.data as Record<string, unknown> | undefined)?.adblockDetectorEnabled, false);

  // Re-enabling is always allowed for paid tiers.
  const on = await request("/api/profiles/me", {
    method: "PUT",
    headers: proHeaders,
    body: JSON.stringify({ adblockDetectorEnabled: true }),
  });
  assert.equal(on.status, 200);
  assert.equal((on.body?.data as Record<string, unknown> | undefined)?.adblockDetectorEnabled, true);
});

test("ad:network clicks are accepted; other platforms stay validated on the profile", async () => {
  const pro = await makeUser("clickuser", "PRO");
  const headers = authHeaders(pro.id);

  const res = await request("/api/profiles/me", {
    method: "PUT",
    headers,
    body: JSON.stringify({ displayName: "Clicker" }),
  });
  assert.equal(res.status, 200);
  const did = (res.body?.data as Record<string, unknown> | undefined)?.id as string;

  // Known ad network on the synthetic platform: accepted and tracked. The
  // click router honors the consent cookie exactly like link clicks, so the
  // request carries the same bp_consent=accept a consenting visitor has.
  const ok = await request("/api/profiles/click", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: "bp_consent=accept" },
    body: JSON.stringify({ profileId: did, platform: "ad:adsense", slug: "ad:adsense" }),
  });
  assert.equal(ok.status, 200);

  // Unknown ad network: rejected before it can fake a click.
  const badNet = await request("/api/profiles/click", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ profileId: did, platform: "ad:evilcoin" }),
  });
  assert.equal(badNet.status, 400);
  assert.match(String(badNet.body?.error), /ad network/i);

  // A real platform still requires the link to exist on the profile.
  const missing = await request("/api/profiles/click", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ profileId: did, platform: "twitter" }),
  });
  assert.equal(missing.status, 400);

  // The write is fire-and-forget on the route; give it a moment to land.
  await new Promise((r) => setTimeout(r, 150));
  const recorded = await prisma.linkClick.findFirst({ where: { profileId: did, platform: "ad:adsense" } });
  assert.ok(recorded, "ad:adsense click should be persisted");
});

// C regression — the create-profile handler (POST /api/profiles/me) inherited
// `hideAds` / `adblockDetectorEnabled` from the shared schema but never ran the
// tier gates the update handlers run, so a FREE account could opt out of ads by
// creating a profile with the flag set in the body.
test("FREE tier cannot bypass the ad opt-out gates via profile creation", async () => {
  const free = await makeUser("createfree", "FREE");
  const headers = authHeaders(free.id);
  const stamp = Date.now();

  const deniedAds = await request("/api/profiles/me", {
    method: "POST",
    headers,
    body: JSON.stringify({ slug: `createfree_${stamp}`, hideAds: true }),
  });
  assert.equal(deniedAds.status, 403, JSON.stringify(deniedAds.body));
  assert.match(String(deniedAds.body?.error), /PRO/);

  const deniedAdblock = await request("/api/profiles/me", {
    method: "POST",
    headers,
    body: JSON.stringify({ slug: `createfree_${stamp}_b`, adblockDetectorEnabled: false }),
  });
  assert.equal(deniedAdblock.status, 403, JSON.stringify(deniedAdblock.body));
  assert.match(String(deniedAdblock.body?.error), /PRO/);

  // A default create still succeeds for FREE.
  const ok = await request("/api/profiles/me", {
    method: "POST",
    headers,
    body: JSON.stringify({ slug: `createfree_${stamp}_c` }),
  });
  assert.equal(ok.status, 201, JSON.stringify(ok.body));
});

test("PRO tier may set the ad opt-out at creation time", async () => {
  const pro = await makeUser("createpro", "PRO");
  const res = await request("/api/profiles/me", {
    method: "POST",
    headers: authHeaders(pro.id),
    body: JSON.stringify({ slug: `createpro_${Date.now()}`, hideAds: true }),
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal((res.body?.data as Record<string, unknown> | undefined)?.hideAds, true);
});