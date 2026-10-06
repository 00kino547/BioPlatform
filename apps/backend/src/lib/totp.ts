import { generateSecret, generateURI, verify, type VerifyResult } from "otplib";
import { decryptAtRestOrRaw, encryptAtRest } from "./atRest.js";

export interface TotpSetup {
  secret: string;
  otpauthUrl: string;
}

const TOTP_SECRET_PURPOSE = "totp:secret";

// The TOTP secret is stored AES-256-GCM encrypted at rest (the Privacy policy
// promises this). `sealTotpSecret` wraps a freshly generated secret before it
// is persisted; `readTotpSecret` unwraps it for verification, transparently
// falling back to legacy plaintext rows created before encryption.
export function sealTotpSecret(secret: string): string {
  return encryptAtRest(TOTP_SECRET_PURPOSE, secret);
}

export function readTotpSecret(stored: string): string {
  return decryptAtRestOrRaw(TOTP_SECRET_PURPOSE, stored);
}

export function generateTotpSecret(username: string, issuer: string): TotpSetup {
  const secret = generateSecret();
  const otpauthUrl = generateURI({
    issuer,
    label: username,
    secret,
  });
  return { secret, otpauthUrl };
}

export async function verifyTotpCode(storedOrRaw: string, code: string): Promise<boolean> {
  if (!/^\d{6}$/.test(code)) return false;
  const secret = readTotpSecret(storedOrRaw);
  try {
    const result: VerifyResult = (await verify({
      token: code,
      secret,
      epochTolerance: [30, 30],
    })) as VerifyResult;
    return result.valid;
  } catch {
    return false;
  }
}
