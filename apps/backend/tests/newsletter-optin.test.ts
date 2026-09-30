import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import type { Server } from "node:http";
import jwt from "jsonwebtoken";
import app from "../src/app.js";
import { getEnv } from "../src/config/env.js";
import { prisma } from "../src/lib/prisma.js";

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

before(async () => {
  await prisma.inviteCode.deleteMany();
  await prisma.user.deleteMany();
  await prisma.role.deleteMany();

  await prisma.role.create({ data: { name: "User", slug: "user", permissions: [] } });
  const role = await prisma.role.create({
    data: { name: "Optin Test", slug: "optin_test", permissions: [] },
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
  await prisma.user.deleteMany();
  await prisma.role.deleteMany();
});

test("newsletter opt-in persists and is returned by GET /auth/me", async () => {
  const user = await prisma.user.create({
    data: {
      username: `optin_${Date.now()}`,
      email: `optin_${Date.now()}@test.local`,
      passwordHash: "not-a-real-hash",
      roleId,
    },
  });
  const headers = authHeaders(user.id);

  // Default state: opted out.
  const before = await request("/api/auth/me", { headers });
  assert.equal(before.status, 200);
  assert.equal(before.body?.success, true);
  assert.equal((before.body?.data as Record<string, unknown> | undefined)?.newsletterOptIn, false);

  // Opt in, then confirm /auth/me reflects the persisted value.
  const optIn = await request("/api/newsletter/optin", {
    method: "POST",
    headers,
    body: JSON.stringify({ enabled: true }),
  });
  assert.equal(optIn.status, 200);

  const afterOptIn = await request("/api/auth/me", { headers });
  assert.equal((afterOptIn.body?.data as Record<string, unknown> | undefined)?.newsletterOptIn, true);

  // Opt out again — the read path must follow the toggle, never a stale snapshot.
  await request("/api/newsletter/optin", {
    method: "POST",
    headers,
    body: JSON.stringify({ enabled: false }),
  });
  const afterOptOut = await request("/api/auth/me", { headers });
  assert.equal((afterOptOut.body?.data as Record<string, unknown> | undefined)?.newsletterOptIn, false);
});