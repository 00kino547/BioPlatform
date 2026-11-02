import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import type { Server } from "node:http";
import jwt from "jsonwebtoken";
import app from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { getEnv } from "../src/config/env.js";
import { POLICY_VERSIONS } from "../src/lib/newsletter.js";

/**
 * Regression test for F11 — the guest-capable (`optionalAuth`) routes must apply
 * the same identity checks as `requireAuth`.
 *
 * Before the fix, `routes/shop.ts`, `routes/dmca.ts` and `routes/invitePurchase.ts`
 * each carried a private `optionalAuth` helper that only verified the JWT
 * signature and `purpose === "auth"`. It never re-read the user, so it accepted:
 *   - a token invalidated by a password change / admin reset / sign-out-all
 *     (the embedded `av` no longer matches `User.authVersion`), and
 *   - a token belonging to a copyright-disabled account (`disabledAt` set),
 *     which `requireAuth` would have rejected with 423.
 * Consequences proven here: a revoked session kept reading its own purchase and
 * minting fresh `product_download` links, and kept downloading paid files.
 *
 * The rig is fully synthetic (disposable database, throwaway user/product/purchase).
 */
describe("F11: optionalAuth must reject stale, revoked and disabled identities", () => {
  let server: Server;
  let baseUrl: string;
  let roleId = "";
  let userId = "";
  let profileId = "";
  let productId = "";
  let purchaseId = "";

  function mint(av: number | null, purpose = "auth") {
    const payload: Record<string, unknown> = { userId, purpose };
    if (av !== null) payload.av = av;
    return jwt.sign(payload, getEnv().JWT_SECRET, { expiresIn: "1h" });
  }

  async function get(path: string, token?: string) {
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${baseUrl}${path}`, { headers });
    const body = (await res.json().catch(() => null)) ?? {};
    return { status: res.status, body };
  }

  before(async () => {
    await prisma.role.deleteMany({ where: { slug: "f11_optional_auth" } });
    const role = await prisma.role.create({
      data: { name: "F11 Optional Auth", slug: "f11_optional_auth", permissions: [] },
    });
    roleId = role.id;

    const username = `f11_buyer_${Math.random().toString(36).slice(2, 8)}`;
    const user = await prisma.user.create({
      data: {
        acceptedTosVersion: POLICY_VERSIONS.tos,
        acceptedPrivacyVersion: POLICY_VERSIONS.privacy,
        acceptedPoliciesAt: new Date(),
        username,
        email: `${username}@f11.test`,
        emailVerified: true,
        emailVerifiedAt: new Date(),
        passwordHash: "not-a-real-hash",
        roleId,
        tier: "FREE",
      },
    });
    userId = user.id;

    const profile = await prisma.profile.create({ data: { userId, slug: `f11-${username}` } });
    profileId = profile.id;

    const product = await prisma.product.create({
      data: { profileId, title: "F11 pack", priceCents: 900, type: "DOWNLOAD", fileName: "f11.bin", filePath: "f11.bin", fileSize: 3 },
    });
    productId = product.id;

    const purchase = await prisma.productPurchase.create({
      data: {
        productId,
        buyerUserId: userId,
        buyerEmail: null,
        title: product.title,
        fileName: product.fileName,
        filePath: product.filePath,
        fileSize: product.fileSize,
        method: "FREE",
        status: "PAID",
        currency: "USD",
        basePriceCents: 0,
        discountPercent: 0,
        finalPriceCents: 0,
        paidAt: new Date(),
      },
    });
    purchaseId = purchase.id;

    server = app.listen(0);
    await once(server, "listening");
    baseUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  });

  after(async () => {
    server?.close();
    await once(server, "close").catch(() => undefined);
    await prisma.productPurchase.deleteMany({ where: { id: purchaseId } });
    await prisma.product.deleteMany({ where: { id: productId } });
    await prisma.profile.deleteMany({ where: { id: profileId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.role.deleteMany({ where: { id: roleId } });
  });

  test("a current token can read its own purchase status", async () => {
    const res = await get(`/api/shop/status/${purchaseId}`, mint(0));
    assert.equal(res.status, 200, JSON.stringify(res.body));
  });

  test("a token issued before an authVersion bump cannot read purchase status", async () => {
    const token = mint(0);
    assert.equal((await get(`/api/shop/status/${purchaseId}`, token)).status, 200);

    await prisma.user.update({ where: { id: userId }, data: { authVersion: { increment: 1 } } });
    try {
      const stale = await get(`/api/shop/status/${purchaseId}`, token);
      assert.equal(stale.status, 403, "a revoked session must not read its purchase");
      assert.equal(stale.body.downloadUrl, undefined, "no fresh download link may be minted for a revoked session");
    } finally {
      await prisma.user.update({ where: { id: userId }, data: { authVersion: 0 } });
    }
  });

  test("a revoked session cannot bypass the download authorization gate", async () => {
    const token = mint(0);
    await prisma.user.update({ where: { id: userId }, data: { authVersion: { increment: 1 } } });
    try {
      const res = await get(`/api/shop/download/${purchaseId}`, token);
      assert.equal(res.status, 401, JSON.stringify(res.body));
    } finally {
      await prisma.user.update({ where: { id: userId }, data: { authVersion: 0 } });
    }
  });

  test("a disabled (DMCA-locked) account is treated as anonymous on optional-auth routes", async () => {
    const token = mint(0);
    await prisma.user.update({
      where: { id: userId },
      data: { disabledAt: new Date(), disabledReason: "dmca" },
    });
    try {
      const status = await get(`/api/shop/status/${purchaseId}`, token);
      assert.equal(status.status, 403, JSON.stringify(status.body));
      assert.equal(status.body.downloadUrl, undefined);
      const download = await get(`/api/shop/download/${purchaseId}`, token);
      assert.equal(download.status, 401, JSON.stringify(download.body));
    } finally {
      await prisma.user.update({ where: { id: userId }, data: { disabledAt: null, disabledReason: null } });
    }
  });

  test("a token minted for another purpose is never treated as a session", async () => {
    const res = await get(`/api/shop/status/${purchaseId}`, mint(0, "email_verify"));
    assert.equal(res.status, 403);
  });

  test("anonymous callers are still rejected", async () => {
    assert.equal((await get(`/api/shop/status/${purchaseId}`)).status, 403);
    assert.equal((await get(`/api/shop/download/${purchaseId}`)).status, 401);
  });
});
