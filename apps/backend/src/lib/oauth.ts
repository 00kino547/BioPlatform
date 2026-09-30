import crypto from "crypto";

export type OAuthProvider = "google" | "github" | "discord";

export interface ProviderProfile {
  id: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
  avatar: string | null;
}

interface ProviderEndpoints {
  authorize: string;
  token: string;
  userInfo: string;
  scope: string;
}

const PROVIDERS: Record<OAuthProvider, ProviderEndpoints> = {
  google: {
    authorize: "https://accounts.google.com/o/oauth2/v2/auth",
    token: "https://oauth2.googleapis.com/token",
    userInfo: "https://www.googleapis.com/oauth2/v3/userinfo",
    scope: "openid email profile",
  },
  github: {
    authorize: "https://github.com/login/oauth/authorize",
    token: "https://github.com/login/oauth/access_token",
    userInfo: "https://api.github.com/user",
    scope: "read:user user:email",
  },
  discord: {
    authorize: "https://discord.com/oauth2/authorize",
    token: "https://discord.com/api/oauth2/token",
    userInfo: "https://discord.com/api/users/@me",
    scope: "identify email",
  },
};

export function getSsoClientCredentials(
  provider: OAuthProvider,
  env: {
    SSO_GOOGLE_CLIENT_ID: string;
    SSO_GOOGLE_CLIENT_SECRET: string;
    SSO_GITHUB_CLIENT_ID: string;
    SSO_GITHUB_CLIENT_SECRET: string;
    SSO_DISCORD_CLIENT_ID: string;
    SSO_DISCORD_CLIENT_SECRET: string;
  }
): { clientId: string; clientSecret: string } | null {
  switch (provider) {
    case "google":
      return env.SSO_GOOGLE_CLIENT_ID
        ? { clientId: env.SSO_GOOGLE_CLIENT_ID, clientSecret: env.SSO_GOOGLE_CLIENT_SECRET }
        : null;
    case "github":
      return env.SSO_GITHUB_CLIENT_ID
        ? { clientId: env.SSO_GITHUB_CLIENT_ID, clientSecret: env.SSO_GITHUB_CLIENT_SECRET }
        : null;
    case "discord":
      return env.SSO_DISCORD_CLIENT_ID
        ? { clientId: env.SSO_DISCORD_CLIENT_ID, clientSecret: env.SSO_DISCORD_CLIENT_SECRET }
        : null;
  }
}

export function ssoProvidersEnabled(
  env: {
    SSO_GOOGLE_CLIENT_ID: string;
    SSO_GITHUB_CLIENT_ID: string;
    SSO_DISCORD_CLIENT_ID: string;
  }
): OAuthProvider[] {
  const enabled: OAuthProvider[] = [];
  for (const p of ["google", "github", "discord"] as const) {
    const key = `SSO_${p.toUpperCase()}_CLIENT_ID` as keyof typeof env;
    if (env[key]) enabled.push(p);
  }
  return enabled;
}

export function base64UrlEncode(input: Buffer): string {
  return input.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function sha256(input: string): Buffer {
  return crypto.createHash("sha256").update(input).digest();
}

export function pkceChallenge(): { verifier: string; challenge: string } {
  const verifier = base64UrlEncode(crypto.randomBytes(32));
  const challenge = base64UrlEncode(sha256(verifier));
  return { verifier, challenge };
}

export function buildAuthorizeUrl(opts: {
  provider: OAuthProvider;
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
}): string {
  const ep = PROVIDERS[opts.provider];
  const url = new URL(ep.authorize);
  url.searchParams.set("client_id", opts.clientId);
  url.searchParams.set("redirect_uri", opts.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", ep.scope);
  url.searchParams.set("state", opts.state);
  url.searchParams.set("code_challenge", opts.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

export async function exchangeAuthCode(
  provider: OAuthProvider,
  opts: {
    code: string;
    codeVerifier: string;
    clientId: string;
    clientSecret: string;
    redirectUri: string;
  },
  http: typeof fetch = fetch
): Promise<string> {
  const ep = PROVIDERS[provider];
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: opts.code,
    redirect_uri: opts.redirectUri,
    client_id: opts.clientId,
    client_secret: opts.clientSecret,
    code_verifier: opts.codeVerifier,
  });
  const res = await http(ep.token, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: body.toString(),
  });
  if (!res.ok) {
    throw new Error(`OAuth token exchange for ${provider} failed with ${res.status}`);
  }
  const data = (await res.json()) as { access_token?: string; error?: string };
  if (!data.access_token) {
    throw new Error(`OAuth token exchange for ${provider} failed: ${data.error ?? "no access_token"}`);
  }
  return data.access_token;
}

async function fetchJson(url: string, headers: Record<string, string>, http: typeof fetch): Promise<Record<string, unknown>> {
  const res = await http(url, { headers });
  if (!res.ok) {
    throw new Error(`OAuth userinfo fetch failed with ${res.status}`);
  }
  return res.json() as Promise<Record<string, unknown>>;
}

export async function fetchProviderProfile(
  provider: OAuthProvider,
  accessToken: string,
  http: typeof fetch = fetch
): Promise<ProviderProfile> {
  const ep = PROVIDERS[provider];
  const authHeaders = { Authorization: `Bearer ${accessToken}`, Accept: "application/json" };

  if (provider === "google") {
    const data = await fetchJson(ep.userInfo, authHeaders, http);
    return {
      id: String(data.sub ?? ""),
      email: typeof data.email === "string" && data.email ? data.email : null,
      emailVerified: data.email_verified === true || data.email_verified === "true",
      name: typeof data.name === "string" && data.name ? data.name : null,
      avatar: typeof data.picture === "string" && data.picture ? data.picture : null,
    };
  }

  if (provider === "github") {
    const data = await fetchJson(ep.userInfo, authHeaders, http);
    let email = typeof data.email === "string" && data.email ? data.email : null;
    let emailVerified = false;
    if (!email) {
      const emails = await fetchJson(`${ep.userInfo}/emails`, authHeaders, http);
      const list = Array.isArray(emails) ? (emails as Array<Record<string, unknown>>) : [];
      const primary = list.find((e) => e.primary === true);
      const chosen = primary ?? list[0];
      if (chosen && typeof chosen.email === "string") {
        email = chosen.email;
        emailVerified = chosen.verified === true;
      }
    }
    return {
      id: String(data.id ?? ""),
      email,
      emailVerified,
      name: typeof data.name === "string" && data.name ? data.name : typeof data.login === "string" ? data.login : null,
      avatar: typeof data.avatar_url === "string" && data.avatar_url ? data.avatar_url : null,
    };
  }

  const data = await fetchJson(ep.userInfo, authHeaders, http);
  return {
    id: String(data.id ?? ""),
    email: typeof data.email === "string" && data.email ? data.email : null,
    emailVerified: data.verified === true,
    name:
      typeof data.global_name === "string" && data.global_name
        ? data.global_name
        : typeof data.username === "string"
          ? data.username
          : null,
    avatar:
      typeof data.id === "string" && typeof data.avatar === "string"
        ? `https://cdn.discordapp.com/avatars/${data.id}/${data.avatar}.png`
        : null,
  };
}