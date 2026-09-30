import crypto from "crypto";
import { createLocalJWKSet, jwtVerify, type JSONWebKeySet, type JWTPayload } from "jose";
import { base64UrlEncode, pkceChallenge, sha256 } from "./oauth.js";
import { getEnv } from "../config/env.js";

export interface OidcDiscovery {
  issuer: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  userinfoEndpoint: string | null;
  jwksUri: string | null;
}

export interface OidcClaims {
  sub: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
  avatar: string | null;
}

interface TokenResponse {
  accessToken: string;
  idToken: string | null;
}

const FETCH_TIMEOUT_MS = 15_000;

export class EnterpriseSsoError extends Error {}

async function fetchJson(url: string): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { accept: "application/json" },
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new EnterpriseSsoError(`OIDC provider responded with HTTP ${res.status}`);
    }
    const text = await res.text();
    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      throw new EnterpriseSsoError("OIDC provider returned invalid JSON");
    }
  } finally {
    clearTimeout(timer);
  }
}

export function normalizeDiscoveryUrl(input: string): string {
  const trimmed = input.trim();
  if (/openid-configuration$/i.test(trimmed) || /\.well-known/i.test(trimmed)) {
    return trimmed;
  }
  return `${trimmed.replace(/\/+$/, "")}/.well-known/openid-configuration`;
}

export async function discoverOidc(discoveryUrl: string): Promise<OidcDiscovery> {
  const doc = await fetchJson(discoveryUrl) as {
    issuer?: unknown;
    authorization_endpoint?: unknown;
    token_endpoint?: unknown;
    userinfo_endpoint?: unknown;
    jwks_uri?: unknown;
  };
  if (
    typeof doc.issuer !== "string" ||
    typeof doc.authorization_endpoint !== "string" ||
    typeof doc.token_endpoint !== "string"
  ) {
    throw new EnterpriseSsoError("OIDC discovery document is missing required endpoints (issuer, authorization_endpoint, token_endpoint)");
  }
  return {
    issuer: doc.issuer,
    authorizationEndpoint: doc.authorization_endpoint,
    tokenEndpoint: doc.token_endpoint,
    userinfoEndpoint: typeof doc.userinfo_endpoint === "string" ? doc.userinfo_endpoint : null,
    jwksUri: typeof doc.jwks_uri === "string" ? doc.jwks_uri : null,
  };
}

export function authorizationUrl(params: {
  discovery: OidcDiscovery;
  clientId: string;
  redirectUri: string;
  state: string;
  verifier: string;
  scopes: string;
}): string {
  const url = new URL(params.discovery.authorizationEndpoint);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", params.clientId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("scope", params.scopes);
  url.searchParams.set("state", params.state);
  url.searchParams.set("code_challenge", base64UrlEncode(sha256(params.verifier)));
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

export async function exchangeCode(params: {
  discovery: OidcDiscovery;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  code: string;
  verifier: string;
}): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: params.code,
    redirect_uri: params.redirectUri,
    client_id: params.clientId,
    client_secret: params.clientSecret,
    code_verifier: params.verifier,
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(params.discovery.tokenEndpoint, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
  const text = await res.text();
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new EnterpriseSsoError("OIDC token endpoint returned invalid JSON");
  }
  if (!res.ok) {
    const errorDescription = typeof data.error_description === "string" ? `: ${data.error_description}` : "";
    throw new EnterpriseSsoError(`Could not complete enterprise SSO login (HTTP ${res.status})${errorDescription}`);
  }
  return {
    accessToken: typeof data.access_token === "string" ? data.access_token : "",
    idToken: typeof data.id_token === "string" ? data.id_token : null,
  };
}

interface IdTokenVerifyParams {
  idToken: string;
  issuer: string;
  clientId: string;
  jwksUri: string | null;
}

export async function verifyIdToken(params: IdTokenVerifyParams): Promise<JWTPayload> {
  const jwksUri = params.jwksUri;
  if (!jwksUri) {
    throw new EnterpriseSsoError("OIDC provider does not expose a JWKS endpoint to verify sign-in");
  }
  let jwks;
  try {
    jwks = await fetchJson(jwksUri);
  } catch (err) {
    if (err instanceof EnterpriseSsoError) throw err;
    throw new EnterpriseSsoError("Could not fetch OIDC signing keys");
  }
  if (!Array.isArray(jwks.keys)) {
    throw new EnterpriseSsoError("OIDC provider returned an invalid signing key set");
  }
  const keySet = createLocalJWKSet(jwks as unknown as JSONWebKeySet);
  try {
    const { payload } = await jwtVerify(params.idToken, keySet, {
      issuer: params.issuer,
      audience: params.clientId,
    });
    return payload;
  } catch {
    throw new EnterpriseSsoError("Enterprise SSO sign-in has already expired or could not be validated");
  }
}

export async function fetchUserInfo(userinfoEndpoint: string, accessToken: string): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(userinfoEndpoint, {
      headers: { authorization: `Bearer ${accessToken}`, accept: "application/json" },
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new EnterpriseSsoError("Could not fetch profile from OIDC provider");
    }
    return (await res.json()) as Record<string, unknown>;
  } finally {
    clearTimeout(timer);
  }
}

export function claimsToProfile(payload: Record<string, unknown>): OidcClaims {
  const sub = typeof payload.sub === "string" ? payload.sub : "";
  const email = typeof payload.email === "string" ? payload.email : null;
  const emailVerified =
    typeof payload.email_verified === "boolean" ? payload.email_verified : typeof payload.email_verified === "string";
  const name =
    typeof payload.name === "string"
      ? payload.name
      : typeof payload.preferred_username === "string"
        ? payload.preferred_username
        : null;
  const avatar =
    typeof payload.picture === "string" && payload.picture.startsWith("http") ? payload.picture : null;
  return { sub, email, emailVerified, name, avatar };
}

export function isEmailAllowed(email: string, allowedDomains: string): boolean {
  const domains = allowedDomains.split(",").map((d) => d.trim().toLowerCase().replace(/^\./, "")).filter(Boolean);
  if (domains.length === 0) return true;
  const at = email.indexOf("@");
  if (at === -1) return false;
  const domain = email.slice(at + 1).toLowerCase();
  return domains.some((d) => domain === d || domain.endsWith(`.${d}`));
}

export function createSsoState(): { verifier: string; challenge: string; state: string; nonce: string } {
  const { verifier, challenge } = pkceChallenge();
  const state = base64UrlEncode(crypto.randomBytes(32));
  const nonce = base64UrlEncode(crypto.randomBytes(32));
  return { verifier, challenge, state, nonce };
}

export function ssoRedirectUri(): string {
  return `${getEnv().APP_URL.replace(/\/+$/, "")}/api/auth/sso/callback`;
}