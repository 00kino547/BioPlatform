import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "crypto";
import { encryptAtRest, decryptAtRest } from "../src/lib/atRest.js";
import { generateTotpSecret, sealTotpSecret, readTotpSecret, verifyTotpCode } from "../src/lib/totp.js";

// Minimal RFC 6238 TOTP generator (HMAC-SHA1, 30s step, 6 digits) so the test
// does not depend on otplib's CLI-facing `authenticator` export. The repo's own
// `verify` uses the same defaults.
function base32Decode(input: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const bits: string[] = [];
  for (const char of input.replace(/=+$/, "").toUpperCase()) {
    const value = alphabet.indexOf(char);
    if (value === -1) continue;
    bits.push(value.toString(2).padStart(5, "0"));
  }
  const joined = bits.join("");
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= joined.length; i += 8) {
    bytes.push(parseInt(joined.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

function totpCode(secret: string, at = Date.now()): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 30_000)));
  const hmac = createHmac("sha1", base32Decode(secret)).update(counter).digest();
  const offset = hmac[19] & 0x0f;
  return ((hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).toString().padStart(6, "0");
}

// A5: the TOTP secret must be sealed (AES-256-GCM) before it hits the DB, and
// pre-encryption plaintext rows must keep verifying.
describe("A5: TOTP secret at rest", () => {
  test("sealed secret round-trips to the original value", () => {
    const raw = generateTotpSecret("alice", "BioPlatform").secret;
    const sealed = sealTotpSecret(raw);
    assert.notEqual(sealed, raw, "the stored value must not equal the plaintext secret");
    assert.equal(readTotpSecret(sealed), raw);
  });

  test("a sealed secret verifies a real authenticator code", async () => {
    const raw = generateTotpSecret("bob", "BioPlatform").secret;
    const code = totpCode(raw);
    assert.equal(await verifyTotpCode(sealTotpSecret(raw), code), true);
    assert.equal(await verifyTotpCode(sealTotpSecret(raw), "000000"), false);
  });

  test("legacy plaintext secrets (pre-encryption rows) still verify", async () => {
    const raw = generateTotpSecret("legacy", "BioPlatform").secret;
    const code = totpCode(raw);
    assert.equal(await verifyTotpCode(raw, code), true);
    assert.equal(await verifyTotpCode(raw, "000000"), false);
  });

  test("a tampered envelope falls back without crashing", () => {
    const sealed = sealTotpSecret("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
    const tampered = sealed.slice(0, -2) + (sealed.endsWith("==") ? "AA==" : "==");
    assert.equal(readTotpSecret(tampered), tampered, "unreadable data is returned raw, never thrown");
  });

  test("purposes are cryptographically isolated", () => {
    const ciphertext = encryptAtRest("totp:secret", "secret-a");
    assert.throws(() => decryptAtRest("totp:secret:other", ciphertext), /unable to authenticate data/i);
  });
});