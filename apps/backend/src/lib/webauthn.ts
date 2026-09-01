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

// Discoverable (resident) passkey login stores its challenges in memory instead
// of the web_authn_challenges table because no user is known at challenge time
// (the table's user_id is a foreign key to users). Matching the assertion is
// done against these issued challenges, and TTL is enforced on lookup.
const DISCOVERABLE_CHALLENGE_TTL_MS = 5 * 60 * 1000;
const discoverableChallenges = new Map<string, { createdAt: number }>();

export type ChallengePurpose = "register" | "login" | "twofactor";

export interface WebauthnEnv {
  rpID: string;
  rpName: string;
  origin: string | string[];
}

function normalizeHost(host: string | undefined): string | null {
  if (!host) return null;
  let value = host.split(",")[0].trim();
  if (value.startsWith("[")) {
    const close = value.indexOf("]");
    if (close === -1) return null;
    value = value.slice(0, close + 1);
  } else {
    const colon = value.indexOf(":");
    if (colon !== -1) value = value.slice(0, colon);
  }
  value = value.toLowerCase().replace(/\.$/, "");
  if (!value || value.length > 253) return null;
  if (!/^[a-z0-9.-]+$/.test(value)) return null;
  return value;
}

function originHostname(origin: string): string | null {
  try {
    return new URL(origin).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function getWebauthnEnv(host?: string): WebauthnEnv {
  const env = getEnv();
  const origins = env.WEBAUTHN_ORIGIN.split(",").map((o) => o.trim()).filter(Boolean);
  const configured: WebauthnEnv = {
    rpID: env.WEBAUTHN_RP_ID,
    rpName: env.WEBAUTHN_RP_NAME,
    origin: origins.length > 1 ? origins : (origins[0] ?? env.WEBAUTHN_ORIGIN),
  };
  const hostname = normalizeHost(host);
  if (!hostname) return configured;
  if (origins.some((o) => originHostname(o) === hostname)) return configured;
  return {
    rpID: hostname,
    rpName: env.WEBAUTHN_RP_NAME,
    origin: [`https://${hostname}`],
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
  const result = await prisma.webAuthnChallenge.deleteMany({
    where: { userId, challenge, purpose, createdAt: { gt: new Date(Date.now() - CHALLENGE_TTL_MS) } },
  });
  return result.count > 0;
}

function pruneDiscoverableChallenges(): void {
  const cutoff = Date.now() - DISCOVERABLE_CHALLENGE_TTL_MS;
  for (const [challenge, entry] of discoverableChallenges) {
    if (entry.createdAt < cutoff) discoverableChallenges.delete(challenge);
  }
  if (discoverableChallenges.size > 1000) {
    const oldest = [...discoverableChallenges.entries()].sort((a, b) => a[1].createdAt - b[1].createdAt);
    for (let i = 0; i < oldest.length && discoverableChallenges.size > 500; i++) {
      discoverableChallenges.delete(oldest[i][0]);
    }
  }
}

export async function generateDiscoverableLoginOptions(opts: {
  userVerification: "preferred" | "discouraged";
  host?: string;
}): Promise<PublicKeyCredentialRequestOptionsJSON> {
  const { rpID } = getWebauthnEnv(opts.host);
  const options = await generateAuthenticationOptions({
    rpID,
    allowCredentials: [],
    userVerification: opts.userVerification,
  });
  discoverableChallenges.set(options.challenge, { createdAt: Date.now() });
  pruneDiscoverableChallenges();
  return options;
}

function extractAssertionChallenge(response: AuthenticationResponseJSON): string | null {
  try {
    const json = JSON.parse(Buffer.from(response.response.clientDataJSON, "base64url").toString("utf8")) as { challenge?: string };
    return typeof json.challenge === "string" ? json.challenge : null;
  } catch {
    return null;
  }
}

export async function verifyDiscoverableLogin(opts: {
  response: AuthenticationResponseJSON;
  getPasskey: (credentialId: string) => Promise<{
    id: string;
    userId: string;
    credentialId: string;
    publicKey: string;
    counter: bigint;
    transports: string[];
  } | null>;
  host?: string;
}): Promise<{ verified: boolean; userId: string | null }> {
  const { rpID, origin } = getWebauthnEnv(opts.host);

  const challenge = extractAssertionChallenge(opts.response);
  if (!challenge) return { verified: false, userId: null };
  const stored = discoverableChallenges.get(challenge);
  if (!stored || Date.now() - stored.createdAt > DISCOVERABLE_CHALLENGE_TTL_MS) {
    discoverableChallenges.delete(challenge);
    return { verified: false, userId: null };
  }

  const passkey = await opts.getPasskey(opts.response.id);
  if (!passkey) return { verified: false, userId: null };

  try {
    const verification = await verifyAuthenticationResponse({
      response: opts.response,
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: toWebAuthnCredential(passkey),
      requireUserVerification: false,
    });
    discoverableChallenges.delete(challenge);
    if (!verification.verified) return { verified: false, userId: null };
    await prisma.passkey.update({
      where: { id: passkey.id },
      data: { counter: BigInt(verification.authenticationInfo.newCounter), lastUsedAt: new Date() },
    });
    return { verified: true, userId: passkey.userId };
  } catch {
    return { verified: false, userId: null };
  }
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
  host?: string;
}): Promise<PublicKeyCredentialCreationOptionsJSON> {
  const { rpID, rpName } = getWebauthnEnv(opts.host);
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
  response: RegistrationResponseJSON,
  host?: string
): Promise<{
  verified: boolean;
  credential: { id: string; publicKey: string; counter: number; transports: string[] };
  credentialDeviceType?: "singleDevice" | "multiDevice";
}> {
  const { rpID, origin } = getWebauthnEnv(host);
  const challengeRecord = await prisma.webAuthnChallenge.findFirst({
    where: { userId, purpose: "register", createdAt: { gt: new Date(Date.now() - CHALLENGE_TTL_MS) } },
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
      credentialDeviceType: verification.registrationInfo.credentialDeviceType,
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
  host?: string;
}): Promise<PublicKeyCredentialRequestOptionsJSON> {
  const { rpID } = getWebauthnEnv(opts.host);
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
  } | null>,
  host?: string
): Promise<{ verified: boolean }> {
  const { rpID, origin } = getWebauthnEnv(host);
  const challengeRecord = await prisma.webAuthnChallenge.findFirst({
    where: { userId, purpose, createdAt: { gt: new Date(Date.now() - CHALLENGE_TTL_MS) } },
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
