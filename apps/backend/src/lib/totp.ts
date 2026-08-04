import { generateSecret, generateURI, verify } from "otplib";

export interface TotpSetup {
  secret: string;
  otpauthUrl: string;
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

export async function verifyTotpCode(secret: string, code: string): Promise<boolean> {
  if (!/^\d{6}$/.test(code)) return false;
  try {
    const result = await verify({
      token: code,
      secret,
      epochTolerance: [30, 30],
    });
    return result.valid;
  } catch {
    return false;
  }
}
