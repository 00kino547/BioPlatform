import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "crypto";
import { getEnv } from "../config/env.js";

const DISCORD_API = "https://discord.com/api/v10";
const STATE_TTL_MS = 10 * 60 * 1000;
const DISCORD_SCOPE = "identify gateway.connect";

export function isDiscordConfigured(): boolean {
  const env = getEnv();
  return Boolean(env.DISCORD_CLIENT_ID && env.DISCORD_CLIENT_SECRET && env.DISCORD_REDIRECT_URI);
}

type DiscordSecretPurpose = "token" | "webhook";

function purposeKey(purpose: DiscordSecretPurpose): Buffer {
  return createHmac("sha256", `bioplatform:discord:${purpose}`).update(getEnv().JWT_SECRET).digest();
}

export function encryptDiscordSecret(value: string, purpose: DiscordSecretPurpose): string {
  const key = purposeKey(purpose);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

export function decryptDiscordSecret(encoded: string, purpose: DiscordSecretPurpose): string {
  const key = purposeKey(purpose);
  const raw = Buffer.from(encoded, "base64");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const data = raw.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

interface SignedState {
  userId: string;
  exp: number;
}

export function createOAuthState(userId: string): string {
  const payload: SignedState = { userId, exp: Date.now() + STATE_TTL_MS };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", getEnv().JWT_SECRET).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyOAuthState(state: string): string | null {
  const [body, sig] = state.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", getEnv().JWT_SECRET).update(body).digest("base64url");
  if (expected !== sig) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SignedState;
    if (!payload.userId || typeof payload.exp !== "number" || payload.exp < Date.now()) return null;
    return payload.userId;
  } catch {
    return null;
  }
}

export function buildDiscordAuthorizeUrl(state: string): string {
  const env = getEnv();
  const params = new URLSearchParams({
    client_id: env.DISCORD_CLIENT_ID,
    response_type: "code",
    redirect_uri: env.DISCORD_REDIRECT_URI,
    scope: DISCORD_SCOPE,
    state,
    prompt: "consent",
  });
  return `https://discord.com/oauth2/authorize?${params.toString()}`;
}

export interface DiscordTokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

async function oauthTokenExchange(body: URLSearchParams): Promise<DiscordTokenPair> {
  const env = getEnv();
  const auth = Buffer.from(`${env.DISCORD_CLIENT_ID}:${env.DISCORD_CLIENT_SECRET}`).toString("base64");
  const res = await fetch(`${DISCORD_API}/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Discord token exchange failed (${res.status}): ${text.slice(0, 200)}`);
  }
  const data = (await res.json()) as { access_token?: string; refresh_token?: string; expires_in?: number };
  if (!data.access_token || !data.refresh_token) {
    throw new Error("Discord token exchange returned no tokens");
  }
  return { accessToken: data.access_token, refreshToken: data.refresh_token, expiresIn: data.expires_in ?? 604800 };
}

export function exchangeDiscordCode(code: string): Promise<DiscordTokenPair> {
  const env = getEnv();
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: env.DISCORD_REDIRECT_URI,
  });
  return oauthTokenExchange(body);
}

export function refreshDiscordTokens(refreshToken: string): Promise<DiscordTokenPair> {
  const body = new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken });
  return oauthTokenExchange(body);
}

export interface DiscordUser {
  id: string;
  username: string;
  globalName: string | null;
  avatar: string | null;
}

export async function fetchDiscordUser(accessToken: string): Promise<DiscordUser> {
  const res = await fetch(`${DISCORD_API}/users/@me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`Discord user fetch failed (${res.status})`);
  }
  const data = (await res.json()) as { id?: string; username?: string; global_name?: string | null; avatar?: string | null };
  if (!data.id || !data.username) {
    throw new Error("Discord user fetch returned an unexpected payload");
  }
  return { id: data.id, username: data.username, globalName: data.global_name ?? null, avatar: data.avatar ?? null };
}

export function buildDiscordAvatarUrl(userId: string, avatar: string | null): string | null {
  if (!avatar) return null;
  if (avatar.startsWith("a_")) {
    return `https://cdn.discordapp.com/avatars/${userId}/${avatar}.gif`;
  }
  return `https://cdn.discordapp.com/avatars/${userId}/${avatar}.png`;
}

export function isDiscordWebhookUrl(value: string): boolean {
  if (typeof value !== "string" || value.length > 512) return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  const host = url.hostname.toLowerCase();
  const isDiscordHost =
    host === "discord.com" || host.endsWith(".discord.com") || host === "discordapp.com" || host.endsWith(".discordapp.com");
  return isDiscordHost && /^\/api\/webhooks\/\d+\/[\w-]+/.test(url.pathname);
}

export function toAbsoluteUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  return `${getEnv().APP_URL.replace(/\/$/, "")}${value.startsWith("/") ? value : `/${value}`}`;
}

export const DISCORD_STATUS_LABELS: Record<string, string> = {
  online: "Online",
  idle: "Idle",
  dnd: "Do Not Disturb",
  offline: "Offline",
};
