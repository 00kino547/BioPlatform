import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import type { Server } from "node:http";
import jwt from "jsonwebtoken";
import app from "../src/app.js";
import { getEnv } from "../src/config/env.js";
import { prisma } from "../src/lib/prisma.js";
import { orderBadges } from "../src/lib/badges.js";
import { loadProfileOgData } from "../src/lib/profileOg.js";

interface OwnedProfile {
  id: string;
  badges?: string[];
}

interface ApiBody {
  success?: boolean;
  error?: string;
  data?: {
    badges?: string[];
    profiles?: OwnedProfile[];
  };
}

let server: Server;
let baseUrl: string;
let tokenA: string;
let profileAId: string;
let profileBId: string;
let profileASlug: string;
const badgeIds: Record<string, string> = {};

async function request(path: string, init?: RequestInit) {
  const res = await fetch(`${baseUrl}${path}`, init);
  const body = (await res.json().catch(() => null)) as ApiBody | null;
  return { status: res.status, body };
}

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}` };
}

before(async () => {
  await prisma.pageView.deleteMany();
  await prisma.linkClick.deleteMany();
  await prisma.musicTrack.deleteMany();
  await prisma.profileAlias.deleteMany();
  await prisma.profileDomain.deleteMany();
  await prisma.discordConnection.deleteMany();
  await prisma.webhookDelivery.deleteMany();
  await prisma.webhook.deleteMany();
  await prisma.passkey.deleteMany();
  await prisma.webAuthnChallenge.deleteMany();
  await prisma.inviteCode.deleteMany();
  await prisma.inviteGrantEvent.deleteMany();
  await prisma.authLog.deleteMany();
  await prisma.authBan.deleteMany();
  await prisma.profile.deleteMany();
  await prisma.user.deleteMany();
  await prisma.badge.deleteMany();
  await prisma.role.deleteMany();

  const role = await prisma.role.create({
    data: { name: "Test User", slug: "test_user", permissions: [] },
  });

  const badges = await Promise.all(
    [1, 2, 3, 4].map((n) =>
      prisma.badge.create({
        data: {
          slug: `test-badge-${n}`,
          label: `Badge ${["One", "Two", "Three", "Four"][n - 1]}`,
          color: `#${String(n).repeat(6)}`,
          icon: "Award",
        },
      })
    )
  );
  badgeIds.b1 = badges[0].id;
  badgeIds.b2 = badges[1].id;
  badgeIds.b3 = badges[2].id;
  badgeIds.b4 = badges[3].id;

  const userA = await prisma.user.create({
    data: {
      username: "badgeorder_a",
      email: "badgeorder_a@test.local",
      passwordHash: "not-a-real-hash",
      roleId: role.id,
      badges: { connect: badges.map((b) => ({ id: b.id })) },
    },
  });
  const userB = await prisma.user.create({
    data: {
      username: "badgeorder_b",
      email: "badgeorder_b@test.local",
      passwordHash: "not-a-real-hash",
      roleId: role.id,
    },
  });

  const profileA = await prisma.profile.create({
    data: {
      userId: userA.id,
      slug: "badgeorder-a",
      isPrimary: true,
      badges: { connect: [{ id: badgeIds.b1 }, { id: badgeIds.b2 }, { id: badgeIds.b3 }] },
    },
  });
  const profileB = await prisma.profile.create({
    data: { userId: userB.id, slug: "badgeorder-b", isPrimary: true },
  });
  profileAId = profileA.id;
  profileBId = profileB.id;
  profileASlug = profileA.slug;

  const secret = getEnv().JWT_SECRET;
  tokenA = jwt.sign({ userId: userA.id, purpose: "auth" }, secret);

  server = app.listen(0);
  await once(server, "listening");
  const addr = server.address();
  if (addr && typeof addr === "object") {
    baseUrl = `http://127.0.0.1:${addr.port}`;
  } else {
    throw new Error("Failed to start test server");
  }
});

after(async () => {
  await new Promise<void>((resolve) => {
    server.closeAllConnections?.();
    server.close(() => resolve());
  });
  await prisma.$disconnect();
});

test("orderBadges keeps original order when no saved order", () => {
  const badges = [{ id: "1" }, { id: "2" }, { id: "3" }];
  assert.equal(orderBadges(badges, undefined), badges);
  assert.deepEqual(orderBadges(badges, null), badges);
  assert.deepEqual(orderBadges(badges, []), badges);
});

test("orderBadges puts saved order first, then remaining in original order", () => {
  const badges = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
  assert.deepEqual(orderBadges(badges, ["c", "a"]).map((b) => b.id), ["c", "a", "b", "d"]);
});

test("orderBadges ignores stale and duplicate ids", () => {
  const badges = [{ id: "a" }, { id: "b" }, { id: "c" }];
  assert.deepEqual(orderBadges(badges, ["zzz", "b", "b", "a"]).map((b) => b.id), ["b", "a", "c"]);
});

test("PUT badge order persists the new order", async () => {
  const res = await request(`/api/profiles/me/${profileAId}/badges/order`, {
    method: "PUT",
    headers: { ...authHeaders(tokenA), "Content-Type": "application/json" },
    body: JSON.stringify({ order: [badgeIds.b3, badgeIds.b1, badgeIds.b2] }),
  });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body?.data?.badges, [badgeIds.b3, badgeIds.b1, badgeIds.b2]);
});

test("GET /me reflects the saved order", async () => {
  const res = await request("/api/profiles/me", { headers: authHeaders(tokenA) });
  assert.equal(res.status, 200);
  const profile = res.body?.data?.profiles?.find((p) => p.id === profileAId);
  assert.deepEqual(profile?.badges, [badgeIds.b3, badgeIds.b1, badgeIds.b2]);
});

test("GET /me/:profileId reflects the saved order", async () => {
  const res = await request(`/api/profiles/me/${profileAId}`, { headers: authHeaders(tokenA) });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body?.data?.badges, [badgeIds.b3, badgeIds.b1, badgeIds.b2]);
});

test("public profile reflects the saved order", async () => {
  const res = await request(`/api/profiles/${profileASlug}`);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body?.data?.badges, [badgeIds.b3, badgeIds.b1, badgeIds.b2]);
});

test("badge order rejects duplicate ids", async () => {
  const res = await request(`/api/profiles/me/${profileAId}/badges/order`, {
    method: "PUT",
    headers: { ...authHeaders(tokenA), "Content-Type": "application/json" },
    body: JSON.stringify({ order: [badgeIds.b3, badgeIds.b3] }),
  });
  assert.equal(res.status, 400);
  assert.equal(res.body?.error, "Badge order cannot contain duplicates");
});

test("badge order rejects badges not on the profile", async () => {
  const res = await request(`/api/profiles/me/${profileAId}/badges/order`, {
    method: "PUT",
    headers: { ...authHeaders(tokenA), "Content-Type": "application/json" },
    body: JSON.stringify({ order: [badgeIds.b4] }),
  });
  assert.equal(res.status, 400);
  assert.equal(res.body?.error, "Badge order can only include badges on this profile");
});

test("badge order rejects malformed bodies", async () => {
  for (const body of [{}, { order: "nope" }, { order: ["not-a-uuid"] }]) {
    const res = await request(`/api/profiles/me/${profileAId}/badges/order`, {
      method: "PUT",
      headers: { ...authHeaders(tokenA), "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    assert.equal(res.status, 400);
    assert.ok(res.body?.error);
  }
});

test("badge order requires auth", async () => {
  const res = await request(`/api/profiles/me/${profileAId}/badges/order`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ order: [badgeIds.b1] }),
  });
  assert.equal(res.status, 401);
});

test("badge order rejects other users' profiles", async () => {
  const res = await request(`/api/profiles/me/${profileBId}/badges/order`, {
    method: "PUT",
    headers: { ...authHeaders(tokenA), "Content-Type": "application/json" },
    body: JSON.stringify({ order: [] }),
  });
  assert.equal(res.status, 404);
});

test("toggling badges keeps saved order and appends new badges", async () => {
  const off = await request(`/api/profiles/me/${profileAId}/badges`, {
    method: "POST",
    headers: { ...authHeaders(tokenA), "Content-Type": "application/json" },
    body: JSON.stringify({ badge: badgeIds.b2, enabled: false }),
  });
  assert.equal(off.status, 200);
  assert.deepEqual(off.body?.data?.badges, [badgeIds.b3, badgeIds.b1]);

  const on = await request(`/api/profiles/me/${profileAId}/badges`, {
    method: "POST",
    headers: { ...authHeaders(tokenA), "Content-Type": "application/json" },
    body: JSON.stringify({ badge: badgeIds.b4, enabled: true }),
  });
  assert.equal(on.status, 200);
  assert.deepEqual(on.body?.data?.badges, [badgeIds.b3, badgeIds.b1, badgeIds.b4]);
});

test("public profile and OG data honor the effective badge order", async () => {
  const pub = await request(`/api/profiles/${profileASlug}`);
  assert.equal(pub.status, 200);
  assert.deepEqual(pub.body?.data?.badges, [badgeIds.b3, badgeIds.b1, badgeIds.b4]);

  const og = await loadProfileOgData(profileASlug);
  assert.ok(og);
  assert.deepEqual(
    og.badges.map((b) => b.label),
    ["Badge Three", "Badge One", "Badge Four"]
  );
});
