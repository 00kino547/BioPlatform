import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import type { Server } from "node:http";
import crypto from "crypto";
import app from "../src/app.js";
import { getEnv } from "../src/config/env.js";
import { prisma } from "../src/lib/prisma.js";

let server: Server;
let baseUrl: string;
let roleId: string;
let referrerId: string;
let validCode: string;

const DAY_MS = 24 * 60 * 60 * 1000;

async function request(path: string) {
  const res = await fetch(`${baseUrl}${path}`);
  const body = (await res.json().catch(() => null)) as {
    success?: boolean;
    error?: string;
    data?: {
      status?: string;
      inviteeDiscountPercent?: number;
      discountDurationDays?: number;
      referrer?: { username: string; slug: string; avatar: string | null; displayName: string | null } | null;
    };
  } | null;
  return { status: res.status, body };
}

async function mkUser(username: string) {
  return prisma.user.create({
    data: {
      username,
      email: `${username}@test.local`,
      passwordHash: "not-a-real-hash",
      roleId,
    },
  });
}

async function mkCode(opts: {
  used?: boolean;
  revoked?: boolean;
  expires?: boolean;
} = {}) {
  return prisma.inviteCode.create({
    data: {
      code: crypto.randomBytes(8).toString("hex"),
      createdById: referrerId,
      usedById: opts.used ? (await mkUser(`used_${Date.now()}`)).id : null,
      usedAt: opts.used ? new Date() : null,
      revokedAt: opts.revoked ? new Date() : null,
      expiresAt: opts.expires ? new Date(Date.now() - DAY_MS) : null,
    },
  });
}

before(async () => {
  await prisma.pageView.deleteMany();
  await prisma.linkClick.deleteMany();
  await prisma.profileAlias.deleteMany();
  await prisma.inviteCode.deleteMany();
  await prisma.inviteGrantEvent.deleteMany();
  await prisma.authLog.deleteMany();
  await prisma.authBan.deleteMany();
  await prisma.profile.deleteMany();
  await prisma.user.deleteMany();
  const role = await prisma.role.create({
    data: { name: "Invite Public Test", slug: "invite_public_test", permissions: [] },
  });
  roleId = role.id;
  referrerId = (await mkUser("invite_referrer")).id;
  await prisma.profile.create({
    data: { userId: referrerId, slug: "invite_referrer", isPrimary: true, isPublic: true, displayName: "Rita Referrer", avatar: null },
  });
  const code = await mkCode();
  validCode = code.code;

  server = app.listen(0);
  await once(server, "listening");
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("no listening address");
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

after(async () => {
  server?.close();
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

test("resolves a valid, unused code with referrer + discount", async () => {
  const { status, body } = await request(`/api/invites/${validCode}`);
  assert.equal(status, 200);
  assert.equal(body?.success, true);
  assert.equal(body?.data?.status, "valid");
  assert.equal(body?.data?.inviteeDiscountPercent, getEnv().AFFILIATE_INVITEE_DISCOUNT_PERCENT);
  assert.equal(body?.data?.discountDurationDays, getEnv().AFFILIATE_DISCOUNT_DURATION_DAYS);
  assert.deepEqual(body?.data?.referrer, {
    username: "invite_referrer",
    slug: "invite_referrer",
    avatar: null,
    displayName: "Rita Referrer",
  });
});

test("hide referrer extras when the referrer's primary profile is not public", async () => {
  await prisma.profile.update({
    where: { slug: "invite_referrer" },
    data: { isPublic: false },
  });
  const code = await mkCode();
  const { status, body } = await request(`/api/invites/${code.code}`);
  assert.equal(status, 200);
  assert.deepEqual(body?.data?.referrer, {
    username: "invite_referrer",
    slug: "invite_referrer",
    avatar: null,
    displayName: null,
  });
  await prisma.profile.update({
    where: { slug: "invite_referrer" },
    data: { isPublic: true },
  });
});

test("unknown, used, revoked, and expired codes all return a uniform 404", async () => {
  const used = await mkCode({ used: true });
  const revoked = await mkCode({ revoked: true });
  const expired = await mkCode({ expires: true });

  for (const code of ["does-not-exist", used.code, revoked.code, expired.code]) {
    const { status, body } = await request(`/api/invites/${code}`);
    assert.equal(status, 404, `expected 404 for ${code}`);
    assert.equal(body?.success, false);
    assert.equal(body?.error, "Invite code not found");
  }
});

test("public resolve requires no authentication", async () => {
  const { status } = await request(`/api/invites/${validCode}`);
  assert.equal(status, 200);
});