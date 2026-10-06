import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { createHash, createSign, generateKeyPairSync, randomBytes, type KeyObject } from "node:crypto";
import { once } from "node:events";
import type { Server } from "node:http";
import bcrypt from "bcrypt";
import { generate, generateSecret } from "otplib";
import app from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { POLICY_VERSIONS } from "../src/lib/newsletter.js";

// A5 — a passkey used as the PRIMARY login factor must NOT bypass TOTP.
// These tests drive the real WebAuthn verification path: they mint a genuine
// P-256 keypair, register the credential directly, then sign an authenticator
// assertion (authenticatorData + clientDataJSON, hashed and ECDSA-signed) so
// @simplewebauthn/server accepts it. That proves the route gates the final
// session on the account's second factor, not just on the mock plumbing.

const RP_ID = "127.0.0.1"; // normalizeHost(requestHost) for requests to the test server
const ORIGIN = `https://${RP_ID}`;

function sha256(data: Buffer): Buffer {
  return createHash("sha256").update(data).digest();
}

function base64url(buf: Buffer | Uint8Array): string {
  return Buffer.from(buf).toString("base64url");
}

// COSE_Key (CBOR) for an ES256 / P-256 public key — the byte format
// @simplewebauthn/server's decodeCredentialPublicKey expects.
function coseEcdsaP256(x: Buffer, y: Buffer): Buffer {
  const out = Buffer.alloc(78);
  let o = 0;
  out[o++] = 0xa5; // map(5)
  out[o++] = 0x01; // kty
  out[o++] = 0x02; //   EC2
  out[o++] = 0x03; // alg
  out[o++] = 0x26; //   ES256 (-7)
  out[o++] = 0x20; // crv
  out[o++] = 0x01; //   P-256
  out[o++] = 0x21; // x
  out[o++] = 0x58; out[o++] = 0x20; // bytes(32)
  x.copy(out, o); o += 32;
  out[o++] = 0x22; // y
  out[o++] = 0x58; out[o++] = 0x20; // bytes(32)
  y.copy(out, o); o += 32;
  return out.subarray(0, o);
}

interface SimulatedAuthenticator {
  credentialId: string;
  cosePublicKey: Buffer;
  privateKey: KeyObject;
  sign(authenticatorData: Buffer, clientDataJSON: Buffer): Buffer;
}

function makeAuthenticator(): SimulatedAuthenticator {
  const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  // SPKI DER ends with the uncompressed point: 0x04 || x || y.
  const publicDer = publicKey.export({ type: "spki", format: "der" });
  const point = publicDer.subarray(publicDer.length - 65);
  const x = point.subarray(1, 33);
  const y = point.subarray(33, 65);
  const credentialId = base64url(randomBytes(32));
  return {
    credentialId,
    cosePublicKey: coseEcdsaP256(x, y),
    privateKey,
    sign(authenticatorData: Buffer, clientDataJSON: Buffer) {
      const signed = Buffer.concat([authenticatorData, sha256(clientDataJSON)]);
      return createSign("sha256").update(signed).sign(privateKey);
    },
  };
}

// Builds a webauthn.get assertion for the given challenge, including UV+UP.
// `counter` must exceed the credential's stored counter (authenticators are
// monotonic) — each successful verification bumps the stored value.
function buildAssertion(auth: SimulatedAuthenticator, challenge: string, counter: number) {
  const rpIdHash = sha256(Buffer.from(RP_ID, "utf8"));
  // flags: UP (0x01) | UV (0x04) -> biometric present.
  const counterBuf = Buffer.alloc(4);
  counterBuf.writeUInt32BE(counter, 0);
  const authenticatorData = Buffer.concat([rpIdHash, Buffer.from([0x05]), counterBuf]);

  const clientDataJSON = Buffer.from(
    JSON.stringify({
      type: "webauthn.get",
      challenge,
      origin: ORIGIN,
      crossOrigin: false,
    }),
    "utf8"
  );

  return {
    id: auth.credentialId,
    rawId: auth.credentialId,
    type: "public-key",
    response: {
      authenticatorData: base64url(authenticatorData),
      clientDataJSON: base64url(clientDataJSON),
      signature: base64url(auth.sign(authenticatorData, clientDataJSON)),
      userHandle: null,
    },
  };
}

describe("A5: passkey primary login cannot bypass TOTP", () => {
  let server: Server;
  let baseUrl: string;
  let roleId: string;

  const totpAuth = makeAuthenticator();
  let nextTotpCounter = 1;
  let totpSecret = "";

  const plainAuth = makeAuthenticator();
  let nextPlainCounter = 1;

  async function request(path: string, init: RequestInit = {}) {
    const res = await fetch(`${baseUrl}${path}`, init);
    const body = (await res.json().catch(() => null)) ?? {};
    return { status: res.status, body };
  }

  async function registerPasskey(userId: string, auth: SimulatedAuthenticator, name: string) {
    await prisma.passkey.create({
      data: {
        userId,
        credentialId: auth.credentialId,
        publicKey: base64url(auth.cosePublicKey),
        counter: 0n,
        transports: [],
        name,
        residentKey: false,
      },
    });
  }

  before(async () => {
    // Clean rows from a previous run, then scaffold users.
    await prisma.passkey.deleteMany({ where: { name: { in: ["a5_totp_key", "a5_plain_key"] } } });
    await prisma.user.deleteMany({ where: { email: { endsWith: "@a5.test" } } });
    await prisma.role.deleteMany({ where: { slug: "a5_user" } });

    const role = await prisma.role.create({ data: { name: "A5 User", slug: "a5_user", permissions: [] } });
    roleId = role.id;

    const hash = await bcrypt.hash("supersecure1", 12);
    // otplib v13 requires a >= 16-byte secret (sceret must not be short).
    const secret = generateSecret();
    totpSecret = secret;
    const totpUser = await prisma.user.create({
      data: {
        acceptedTosVersion: POLICY_VERSIONS.tos,
        acceptedPrivacyVersion: POLICY_VERSIONS.privacy,
        acceptedPoliciesAt: new Date(),
        username: "a5_totp",
        email: "a5_totp@a5.test",
        passwordHash: hash,
        roleId,
        // A3b — fixtures are established, verified accounts so the passkey
        // login verification gate never applies to them.
        emailVerified: true,
        emailVerifiedAt: new Date(),
        totpEnabled: true,
        totpSecret: secret,
      },
    });
    const plainUser = await prisma.user.create({
      data: {
        acceptedTosVersion: POLICY_VERSIONS.tos,
        acceptedPrivacyVersion: POLICY_VERSIONS.privacy,
        acceptedPoliciesAt: new Date(),
        username: "a5_plain",
        email: "a5_plain@a5.test",
        passwordHash: hash,
        roleId,
        emailVerified: true,
        emailVerifiedAt: new Date(),
      },
    });

    await registerPasskey(totpUser.id, totpAuth, "a5_totp_key");
    await registerPasskey(plainUser.id, plainAuth, "a5_plain_key");

    server = app.listen(0);
    await once(server, "listening");
    baseUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  });

  after(async () => {
    server.close();
    await once(server, "close");
    await prisma.passkey.deleteMany({ where: { name: { in: ["a5_totp_key", "a5_plain_key"] } } });
    await prisma.user.deleteMany({ where: { roleId } });
    await prisma.role.deleteMany({ where: { slug: "a5_user" } });
  });

  test("identifier-based passkey login bounces a TOTP-enabled account to the second factor", async () => {
    const opt = await request("/api/auth/login/passkey/options", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: "a5_totp" }),
    });
    assert.equal(opt.status, 200, JSON.stringify(opt.body));
    const challenge = (opt.body as { data?: { options?: { challenge?: string } } }).data?.options?.challenge;
    assert.ok(challenge);

    const verify = await request("/api/auth/login/passkey/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: "a5_totp", response: buildAssertion(totpAuth, challenge, nextTotpCounter++) }),
    });

    assert.equal(verify.status, 200, JSON.stringify(verify.body));
    const data = verify.body as {
      data?: { requiresTwoFactor?: boolean; twoFactorToken?: string; token?: string; methods?: { totp?: boolean } };
    };
    assert.equal(data.data?.requiresTwoFactor, true, "TOTP-protected account must demand the second factor");
    assert.ok(data.data?.twoFactorToken, "a twoFactorToken must be issued for the second step");
    assert.equal(data.data?.methods?.totp, true);
    assert.equal(data.data?.token, undefined, "a full session token must NOT be minted for a TOTP account");
  });

  test("identifier-based passkey login still works for a passkey-only account", async () => {
    const opt = await request("/api/auth/login/passkey/options", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: "a5_plain" }),
    });
    const challenge = (opt.body as { data?: { options?: { challenge?: string } } }).data?.options?.challenge;
    assert.ok(challenge);

    const verify = await request("/api/auth/login/passkey/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: "a5_plain", response: buildAssertion(plainAuth, challenge, nextPlainCounter++) }),
    });
    assert.equal(verify.status, 200, JSON.stringify(verify.body));
    const data = verify.body as { data?: { requiresTwoFactor?: boolean; token?: string } };
    assert.equal(data.data?.requiresTwoFactor, undefined, "no TOTP -> no second-factor bounce");
    assert.ok(data.data?.token, "a full session token must be issued for a passkey-only account");
  });

  test("discoverable passkey login bounces a TOTP-enabled account to the second factor", async () => {
    // NOTE: only the TOTP account's passkey is registered, so only its
    // credential can be found at verification time.
    const opt = await request("/api/auth/login/passkey/discoverable/options", { method: "POST" });
    assert.equal(opt.status, 200, JSON.stringify(opt.body));
    const challenge = (opt.body as { data?: { options?: { challenge?: string } } }).data?.options?.challenge;
    assert.ok(challenge);

    const verify = await request("/api/auth/login/passkey/discoverable/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ response: buildAssertion(totpAuth, challenge, nextTotpCounter++) }),
    });
    assert.equal(verify.status, 200, JSON.stringify(verify.body));
    const data = verify.body as {
      data?: { requiresTwoFactor?: boolean; twoFactorToken?: string; token?: string; methods?: { totp?: boolean } };
    };
    assert.equal(data.data?.requiresTwoFactor, true, "discoverable passkey must not bypass TOTP either");
    assert.ok(data.data?.twoFactorToken);
    assert.equal(data.data?.methods?.totp, true);
    assert.equal(data.data?.token, undefined);
  });

  test("the second factor completes into a real session token", async () => {
    // Prove the bounce is NOT a dead end: completing TOTP afterwards yields a
    // genuine full session. (Also guards the twoFactorToken round-trip.)
    const opt = await request("/api/auth/login/passkey/options", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: "a5_totp" }),
    });
    const challenge = (opt.body as { data?: { options?: { challenge?: string } } }).data?.options?.challenge;
    const twoFA = await request("/api/auth/login/passkey/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: "a5_totp", response: buildAssertion(totpAuth, challenge, nextTotpCounter++) }),
    });
    const secondToken = (twoFA.body as { data?: { twoFactorToken?: string } }).data?.twoFactorToken;
    assert.ok(secondToken);

    // Generates the TOTP code for the account's seeded secret.
    const code = await generate({ secret: totpSecret });
    const complete = await request("/api/auth/2fa/totp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: secondToken, code }),
    });
    assert.equal(complete.status, 200, JSON.stringify(complete.body));
    const data = complete.body as { data?: { token?: string } };
    assert.ok(data.data?.token, "completing the second factor must mint the session token");
  });
});