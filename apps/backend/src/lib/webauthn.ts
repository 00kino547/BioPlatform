import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
  type WebAuthnCredential,
} from "@simplewebauthn/server";
import type { AuthenticatorTransportFuture } from "@simplewebauthn/server";
import { prisma } from "./prisma.js";
import { getEnv } from "../config/env.js";

const CHALLENGE_TTL_MS = 5 * 60 * 1000;

export type ChallengePurpose = "register" | "login" | "twofactor";

export interface WebauthnEnv {
  rpID: string;
  rpName: string;
  origin: string;
}

export function getWebauthnEnv(): WebauthnEnv {
  const env = getEnv();
  return {
    rpID: env.WEBAUTHN_RP_ID,
    rpName: env.WEBAUTHN_RP_NAME,
    origin: env.WEBAUTHN_ORIGIN,
  };
}

export function toWebAuthnCredential(passkey: {
  credentialId: string;
  publicKey: string;
  counter: bigint;
  transports: string[];
}): WebAuthnCredential {
  return {
    id: passkey.credentialId,
    publicKey: publicKeyFromBase64(passkey.publicKey),
    counter: Number(passkey.counter),
    transports: passkey.transports as AuthenticatorTransportFuture[],
  };
}

function publicKeyToBase64(key: Uint8Array<ArrayBuffer>): string {
  return Buffer.from(key).toString("base64url");
}

function publicKeyFromBase64(key: string): Uint8Array<ArrayBuffer> {
  return new Uint8Array(Buffer.from(key, "base64url")) as Uint8Array<ArrayBuffer>;
}

async function storeChallenge(userId: string, challenge: string, purpose: ChallengePurpose) {
  await prisma.webAuthnChallenge.create({ data: { userId, challenge, purpose } });
}

export async function consumeChallenge(userId: string, challenge: string, purpose: ChallengePurpose): Promise<boolean> {
  const record = await prisma.webAuthnChallenge.findFirst({
    where: { userId, challenge, purpose },
  });
  if (!record) return false;
  await prisma.webAuthnChallenge.deleteMany({ where: { id: record.id } });
  return true;
}

export async function cleanupExpiredChallenges(): Promise<void> {
  await prisma.webAuthnChallenge.deleteMany({
    where: { createdAt: { lt: new Date(Date.now() - CHALLENGE_TTL_MS) } },
  });
}

export async function generateRegisterOptions(opts: {
  userId: string;
  username: string;
  displayName: string;
  residentKey: "resident" | "nonResident";
  excludeCredentials: string[];
}): Promise<PublicKeyCredentialCreationOptionsJSON> {
  const { rpID, rpName } = getWebauthnEnv();
  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userName: opts.username,
    userID: new TextEncoder().encode(opts.userId),
    userDisplayName: opts.displayName || opts.username,
    attestationType: "none",
    authenticatorSelection: {
      residentKey: opts.residentKey === "resident" ? "preferred" : "discouraged",
      userVerification: "preferred",
    },
    excludeCredentials: opts.excludeCredentials.map((id) => ({ id })),
  });
  await storeChallenge(opts.userId, options.challenge, "register");
  return options;
}

export async function verifyRegister(
  userId: string,
  response: RegistrationResponseJSON
): Promise<{ verified: boolean; credential: { id: string; publicKey: string; counter: number; transports: string[] } }> {
  const { rpID, origin } = getWebauthnEnv();
  const challengeRecord = await prisma.webAuthnChallenge.findFirst({
    where: { userId, purpose: "register" },
    orderBy: { createdAt: "desc" },
  });
  if (!challengeRecord) {
    return { verified: false, credential: { id: "", publicKey: "", counter: 0, transports: [] } };
  }

  const existing = await prisma.passkey.findUnique({ where: { credentialId: response.id } });
  if (existing) {
    return { verified: false, credential: { id: "", publicKey: "", counter: 0, transports: [] } };
  }

  try {
    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: challengeRecord.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: false,
    });
    await prisma.webAuthnChallenge.deleteMany({ where: { id: challengeRecord.id } });
    if (!verification.verified || !verification.registrationInfo) {
      return { verified: false, credential: { id: "", publicKey: "", counter: 0, transports: [] } };
    }
    return {
      verified: true,
      credential: {
        id: verification.registrationInfo.credential.id,
        publicKey: publicKeyToBase64(verification.registrationInfo.credential.publicKey),
        counter: verification.registrationInfo.credential.counter,
        transports: verification.registrationInfo.credential.transports ?? [],
      },
    };
  } catch {
    return { verified: false, credential: { id: "", publicKey: "", counter: 0, transports: [] } };
  }
}

export async function generateLoginOptions(opts: {
  userId: string;
  allowCredentials: { id: string; transports: string[] }[];
  userVerification: "preferred" | "discouraged";
  purpose?: "login" | "twofactor";
}): Promise<PublicKeyCredentialRequestOptionsJSON> {
  const { rpID } = getWebauthnEnv();
  const options = await generateAuthenticationOptions({
    rpID,
    allowCredentials: opts.allowCredentials.map((c) => ({ id: c.id, transports: c.transports as AuthenticatorTransportFuture[] })),
    userVerification: opts.userVerification,
  });
  await storeChallenge(opts.userId, options.challenge, opts.purpose ?? "login");
  return options;
}

export async function verifyLogin(
  userId: string,
  response: AuthenticationResponseJSON,
  purpose: "login" | "twofactor",
  getPasskey: (credentialId: string) => Promise<{
    id: string;
    credentialId: string;
    publicKey: string;
    counter: bigint;
    transports: string[];
  } | null>
): Promise<{ verified: boolean }> {
  const { rpID, origin } = getWebauthnEnv();
  const challengeRecord = await prisma.webAuthnChallenge.findFirst({
    where: { userId, purpose },
    orderBy: { createdAt: "desc" },
  });
  if (!challengeRecord) return { verified: false };

  const passkey = await getPasskey(response.id);
  if (!passkey) return { verified: false };

  try {
    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challengeRecord.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: toWebAuthnCredential(passkey),
      requireUserVerification: false,
    });
    await prisma.webAuthnChallenge.deleteMany({ where: { id: challengeRecord.id } });
    if (!verification.verified) return { verified: false };
    await prisma.passkey.update({
      where: { id: passkey.id },
      data: { counter: BigInt(verification.authenticationInfo.newCounter), lastUsedAt: new Date() },
    });
    return { verified: true };
  } catch {
    return { verified: false };
  }
}
