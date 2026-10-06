import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { getEnv } from "../config/env.js";

// Shared AES-256-GCM at-rest encryption envelope.
//
// Every call site passes a distinct `purpose` string; the encryption key is
// derived as SHA-256("bioplatform:<purpose>" + JWT_SECRET) so ciphertexts
// written for one purpose are never accidentally readable under another
// (e.g. a leaked webhook secret cannot be reused to decrypt TOTP secrets).
//
// Format of the returned string: base64( iv(12) || authTag(16) || ciphertext ).
// This matches the envelope used by the webhook / discord / newsletter
// senders; a fresh purpose string keeps them cryptographically separated.
export function encryptAtRest(purpose: string, value: string): string {
  const key = atRestKey(purpose);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

export function decryptAtRest(purpose: string, encoded: string): string {
  const key = atRestKey(purpose);
  const raw = Buffer.from(encoded, "base64");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const data = raw.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

function atRestKey(purpose: string): Buffer {
  return createHash("sha256").update(`bioplatform:${purpose}`).update(getEnv().JWT_SECRET).digest();
}

// Some stored values predate envelope encryption (legacy plaintext such as the
// raw base32 TOTP secrets seeded before this helper existed). `decryptOrRaw`
// returns the envelope if it looks like ours and decrypts cleanly, otherwise
// the value is passed through untouched so old rows keep working. A tampered
// envelope fails the AES-GCM authentication tag and falls back to raw, which
// will generally fail downstream validation in the same way the plaintext
// value would have — never crashing on stored data.
export function decryptAtRestOrRaw(purpose: string, value: string): string {
  try {
    return decryptAtRest(purpose, value);
  } catch {
    return value;
  }
}