import { Router, type Request, type Response } from "express";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { getEnv } from "../config/env.js";
import { requireAuth } from "../middleware/auth.js";
import { requireApiLevel } from "../middleware/admin.js";
import { stripHtml } from "../lib/validation.js";
import { encryptSecret, decryptSecret } from "../lib/webhook.js";
import { signToken, signTwoFactorToken, userPublic } from "./auth.js";
import { isAccountSsoForced } from "../lib/ssoEnforcement.js";
import {
  authorizationUrl,
  claimsToProfile,
  createSsoState,
  discoverOidc,
  exchangeCode,
  fetchUserInfo,
  isEmailAllowed,
  normalizeDiscoveryUrl,
  ssoRedirectUri,
  verifyIdToken,
  EnterpriseSsoError,
} from "../lib/enterpriseSso.js";

const router = Router();

type SsoMode = "login" | "link";

interface SsoStatePayload {
  purpose: "sso_state";
  configId: string;
  mode: SsoMode;
  verifier: string;
  linkUserId?: string;
}

interface SsoExchangePayload {
  purpose: "sso_exchange";
  configId: string;
  providerAccountId: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
  avatar: string | null;
}

const STATE_COOKIE = "sso_state";
const STATE_TTL_SECONDS = 10 * 60;
const EXCHANGE_TTL_SECONDS = 10 * 60;

function ssoJwt<T>(payload: T, expiresInSeconds: number): string {
  return jwt.sign(payload as jwt.JwtPayload, getEnv().JWT_SECRET, { expiresIn: expiresInSeconds });
}

function verifySsoJwt<T>(token: string, purpose: string): T | null {
  try {
    const payload = jwt.verify(token, getEnv().JWT_SECRET) as Record<string, unknown> & { purpose: string };
    if (payload.purpose !== purpose) return null;
    return payload as T;
  } catch {
    return null;
  }
}

function appUrl(): string {
  return getEnv().APP_URL.replace(/\/+$/, "");
}

function frontendPath(userPath: string): string {
  return `${appUrl()}${userPath.startsWith("/") ? userPath : `/${userPath}`}`;
}

function readStateCookie(req: Request): string | null {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === STATE_COOKIE) {
      return decodeURIComponent(part.slice(idx + 1).trim());
    }
  }
  return null;
}

function setStateCookie(req: Request, res: Response, token: string) {
  res.cookie(STATE_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: req.secure,
    path: "/api/auth/sso/callback",
    maxAge: STATE_TTL_SECONDS * 1000,
  });
}

function clearStateCookie(res: Response) {
  res.clearCookie(STATE_COOKIE, { path: "/api/auth/sso/callback" });
}

function bearerUserId(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return null;
  try {
    const payload = jwt.verify(authHeader.slice(7), getEnv().JWT_SECRET) as {
      userId?: string;
      purpose?: string;
    };
    if (!payload.userId || payload.purpose !== "auth") return null;
    return payload.userId;
  } catch {
    return null;
  }
}

interface LocalUser {
  id: string;
  username: string;
  email: string;
  roleId: string;
  tier: string;
  trackLimit: number | null;
  profileLimit: number | null;
  aliasLimit: number | null;
  badges?: { id: string }[];
  totpEnabled: boolean;
}

async function issueLoginResponse(res: Response, user: LocalUser) {
  const passkeyCount = await prisma.passkey.count({ where: { userId: user.id } });
  const requiresTwoFactor = user.totpEnabled || passkeyCount > 0;
  if (requiresTwoFactor) {
    return res.json({
      success: true,
      data: {
        status: "needs_two_factor",
        twoFactorToken: signTwoFactorToken(user.id),
        methods: { totp: user.totpEnabled, passkey: passkeyCount > 0 },
      },
    });
  }
  const token = await signToken(user.id, getEnv().JWT_EXPIRES_IN);
  return res.json({
    success: true,
    data: { status: "logged_in", token, user: await userPublic(user) },
  });
}

function configPublic(config: {
  id: string;
  displayName: string;
  logoUrl: string | null;
  issuerUrl: string;
}) {
  let host: string | null = null;
  try {
    host = new URL(config.issuerUrl).host;
  } catch {
    host = config.issuerUrl;
  }
  return {
    id: config.id,
    displayName: config.displayName,
    logoUrl: config.logoUrl,
    issuerHost: host,
  };
}

router.get("/config", requireAuth, requireApiLevel("enterprise"), async (req, res) => {
  const config = await prisma.enterpriseSso.findUnique({ where: { userId: req.userId as string } });
  if (!config) {
    return res.json({ success: true, data: null });
  }
  const identityCount = await prisma.enterpriseSsoIdentity.count({ where: { ssoId: config.id } });
  res.json({
    success: true,
    data: {
      id: config.id,
      issuerUrl: config.issuerUrl,
      clientId: config.clientId,
      clientSecretMasked: `${config.clientSecret.slice(0, 4)}…${config.clientSecret.slice(-4)}`,
      scopes: config.scopes,
      displayName: config.displayName,
      logoUrl: config.logoUrl,
      allowedDomains: config.allowedDomains,
      enforced: config.enforced,
      enabled: config.enabled,
      createdAt: config.createdAt,
      updatedAt: config.updatedAt,
      identityCount,
    },
  });
});

const configSchema = z.object({
  issuerUrl: z.string().url().refine((v) => /^https:\/\//.test(v), {
    message: "SSO issuer must use HTTPS",
  }),
  clientId: z.string().min(1, "Client ID is required").max(300),
  clientSecret: z.string().optional(),
  scopes: z.string().max(300).default("openid email profile"),
  displayName: z.string().trim().min(1, "A provider name is required").max(64),
  logoUrl: z.string().url().or(z.literal("")).optional(),
  allowedDomains: z.string().max(2000).default(""),
  enforced: z.boolean().default(false),
  enabled: z.boolean().default(true),
});

router.put("/config", requireAuth, requireApiLevel("enterprise"), async (req, res) => {
  const parsed = configSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: parsed.error.issues[0].message });
  }
  const existing = await prisma.enterpriseSso.findUnique({ where: { userId: req.userId as string } });
  const incomingSecret = parsed.data.clientSecret?.trim();
  if (!existing && !incomingSecret) {
    return res.status(400).json({ success: false, error: "Client secret is required when creating an SSO provider" });
  }

  const data = {
    issuerUrl: stripHtml(parsed.data.issuerUrl.trim()),
    clientId: stripHtml(parsed.data.clientId.trim()),
    clientSecret: incomingSecret ? encryptSecret(incomingSecret) : (existing?.clientSecret ?? ""),
    scopes: stripHtml(parsed.data.scopes.trim()),
    displayName: stripHtml(parsed.data.displayName.trim()),
    logoUrl: parsed.data.logoUrl ? stripHtml(parsed.data.logoUrl.trim()) : null,
    allowedDomains: stripHtml(parsed.data.allowedDomains.trim()),
    enforced: parsed.data.enforced,
    enabled: parsed.data.enabled,
  };

  const config = existing
    ? await prisma.enterpriseSso.update({ where: { id: existing.id }, data })
    : await prisma.enterpriseSso.create({ data: { ...data, userId: req.userId as string } });

  res.json({ success: true, data: { id: config.id, saved: true } });
});

router.delete("/config", requireAuth, requireApiLevel("enterprise"), async (req, res) => {
  const existing = await prisma.enterpriseSso.findUnique({ where: { userId: req.userId as string } });
  if (!existing) {
    return res.status(404).json({ success: false, error: "SSO provider not configured" });
  }
  await prisma.enterpriseSso.delete({ where: { id: existing.id } });
  res.json({ success: true, data: { removed: true } });
});

router.get("/configs", async (_req, res) => {
  const configs = await prisma.enterpriseSso.findMany({
    where: { enabled: true },
    select: { id: true, displayName: true, logoUrl: true, issuerUrl: true },
    orderBy: { displayName: "asc" },
  });
  res.json({ success: true, data: configs.map(configPublic) });
});

const startSchema = z.object({
  configId: z.string().uuid(),
  mode: z.enum(["login", "link"]).default("login"),
});

router.post("/start", async (req, res) => {
  const parsed = startSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: parsed.error.issues[0].message });
  }

  const config = await prisma.enterpriseSso.findUnique({ where: { id: parsed.data.configId } });
  if (!config || !config.enabled) {
    return res.status(404).json({ success: false, error: "SSO provider not found" });
  }

  let linkUserId: string | undefined;
  if (parsed.data.mode === "link") {
    const userId = bearerUserId(req);
    if (!userId) {
      return res.status(401).json({ success: false, error: "Login required to link an account" });
    }
    if (userId !== config.userId) {
      return res.status(403).json({ success: false, error: "Only the account that owns this SSO provider can link it" });
    }
    linkUserId = userId;
  }

  try {
    const discovery = await discoverOidc(normalizeDiscoveryUrl(config.issuerUrl));
    const verifier = createSsoState().verifier;
    const sessionToken = ssoJwt<SsoStatePayload>(
      {
        purpose: "sso_state",
        configId: config.id,
        mode: linkUserId ? "link" : "login",
        verifier,
        ...(linkUserId ? { linkUserId } : {}),
      },
      STATE_TTL_SECONDS
    );
    setStateCookie(req, res, sessionToken);

    const authorizeUrl = authorizationUrl({
      discovery,
      clientId: config.clientId,
      redirectUri: ssoRedirectUri(),
      state: sessionToken,
      verifier,
      scopes: config.scopes,
    });

    res.json({ success: true, data: { redirectUrl: authorizeUrl } });
  } catch (err) {
    const message = err instanceof EnterpriseSsoError ? err.message : "Could not reach the SSO provider";
    res.status(502).json({ success: false, error: message });
  }
});

router.get("/callback", async (req, res) => {
  const code = String(req.query.code ?? "");
  const state = String(req.query.state ?? "");
  const providerError = String(req.query.error ?? "");
  const cookieState = readStateCookie(req);

  const fail = (error: string) => {
    clearStateCookie(res);
    res.redirect(frontendPath(`/sso/callback?${new URLSearchParams({ error })}`));
  };

  if (providerError) {
    return fail(providerError === "access_denied" ? "Authorization was cancelled." : `Provider error: ${providerError}`);
  }
  if (!code) {
    return fail("Missing OIDC response");
  }

  const statePayload = verifySsoJwt<SsoStatePayload>(state, "sso_state");
  if (!statePayload || !cookieState || cookieState !== state) {
    return fail("Invalid SSO request");
  }

  const config = await prisma.enterpriseSso.findUnique({ where: { id: statePayload.configId } });
  if (!config || !config.enabled) {
    return fail("This SSO provider is no longer available");
  }

  clearStateCookie(res);

  try {
    const discovery = await discoverOidc(normalizeDiscoveryUrl(config.issuerUrl));
    const tokens = await exchangeCode({
      discovery,
      clientId: config.clientId,
      clientSecret: decryptSecret(config.clientSecret),
      redirectUri: ssoRedirectUri(),
      code,
      verifier: statePayload.verifier,
    });

    let payload: Record<string, unknown>;
    if (tokens.idToken) {
      payload = (await verifyIdToken({
        idToken: tokens.idToken,
        issuer: discovery.issuer,
        clientId: config.clientId,
        jwksUri: discovery.jwksUri,
      })) as Record<string, unknown>;
    } else if (discovery.userinfoEndpoint && tokens.accessToken) {
      payload = await fetchUserInfo(discovery.userinfoEndpoint, tokens.accessToken);
    } else {
      return fail("The SSO provider did not return a verifiable identity");
    }

    const profile = claimsToProfile(payload);
    if (!profile.sub) {
      return fail("The SSO provider did not return a subject identifier");
    }
    if (!profile.email || !profile.emailVerified) {
      return fail("Enterprise SSO requires a verified email address");
    }
    if (!isEmailAllowed(profile.email, config.allowedDomains)) {
      return fail(`Sign-in with ${profile.email} is not allowed on this SSO provider`);
    }

    if (statePayload.mode === "link" && statePayload.linkUserId) {
      const existing = await prisma.enterpriseSsoIdentity.findUnique({
        where: { ssoId_providerAccountId: { ssoId: config.id, providerAccountId: profile.sub } },
      });
      if (existing && existing.userId !== statePayload.linkUserId) {
        return fail("This SSO identity is already linked to another account");
      }
      if (!existing) {
        await prisma.enterpriseSsoIdentity.create({
          data: {
            ssoId: config.id,
            providerAccountId: profile.sub,
            email: profile.email,
            emailVerified: true,
            userId: statePayload.linkUserId,
          },
        });
      }
      return res.redirect(frontendPath("/sso/callback?status=linked"));
    }

    const exchange = ssoJwt<SsoExchangePayload>(
      {
        purpose: "sso_exchange",
        configId: config.id,
        providerAccountId: profile.sub,
        email: profile.email,
        emailVerified: profile.emailVerified,
        name: profile.name,
        avatar: profile.avatar,
      },
      EXCHANGE_TTL_SECONDS
    );
    res.redirect(frontendPath(`/sso/callback?code=${encodeURIComponent(exchange)}`));
  } catch (err) {
    const message = err instanceof EnterpriseSsoError ? err.message : "Could not complete enterprise SSO login";
    fail(message);
  }
});

const exchangeSchema = z.object({
  code: z.string().min(1),
});

router.post("/exchange", async (req, res) => {
  const parsed = exchangeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: parsed.error.issues[0].message });
  }

  const payload = verifySsoJwt<SsoExchangePayload>(parsed.data.code, "sso_exchange");
  if (!payload) {
    return res.status(400).json({ success: false, error: "Invalid or expired login session" });
  }

  const config = await prisma.enterpriseSso.findUnique({ where: { id: payload.configId } });
  if (!config || !config.enabled) {
    return res.status(400).json({ success: false, error: "This SSO provider is no longer available" });
  }

  const identity = await prisma.enterpriseSsoIdentity.findUnique({
    where: { ssoId_providerAccountId: { ssoId: config.id, providerAccountId: payload.providerAccountId } },
    include: { user: true },
  });

  if (identity) {
    return issueLoginResponse(res, identity.user);
  }

  if (!payload.email || !payload.emailVerified) {
    return res.status(400).json({ success: false, error: "Enterprise SSO requires a verified email address" });
  }
  if (!isEmailAllowed(payload.email, config.allowedDomains)) {
    return res.status(403).json({ success: false, error: `Sign-in with ${payload.email} is not allowed on this SSO provider` });
  }

  const existingUser = await prisma.user.findUnique({ where: { email: payload.email.toLowerCase() } });
  if (!existingUser) {
    return res.status(404).json({
      success: false,
      error: "No account uses this email yet. Enterprise SSO signs in existing accounts — ask the account owner to invite you first.",
    });
  }

  // The IdP proves mailbox control with a verified identity, so SSO sign-in is
  // also a valid email-verification path for an unverified local account (A3b).
  if (!existingUser.emailVerified) {
    await prisma.user.update({
      where: { id: existingUser.id },
      data: { emailVerified: true, emailVerifiedAt: new Date() },
    });
  }

  await prisma.enterpriseSsoIdentity.create({
    data: {
      ssoId: config.id,
      providerAccountId: payload.providerAccountId,
      email: payload.email.toLowerCase(),
      emailVerified: true,
      userId: existingUser.id,
    },
  });

  return issueLoginResponse(res, existingUser);
});

router.get("/identities", requireAuth, async (req, res) => {
  const identities = await prisma.enterpriseSsoIdentity.findMany({
    where: { userId: req.userId as string },
    select: {
      id: true,
      email: true,
      createdAt: true,
      sso: { select: { id: true, displayName: true, logoUrl: true, enforced: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  res.json({ success: true, data: identities });
});

router.delete("/identities/:id", requireAuth, async (req, res) => {
  const identity = await prisma.enterpriseSsoIdentity.findUnique({ where: { id: String(req.params.id) } });
  if (!identity || identity.userId !== (req.userId as string)) {
    return res.status(404).json({ success: false, error: "SSO identity not found" });
  }
  const user = await prisma.user.findUnique({ where: { id: identity.userId }, select: { passwordHash: true } });
  const oauthCount = await prisma.oAuthAccount.count({ where: { userId: identity.userId } });
  const ssoCount = await prisma.enterpriseSsoIdentity.count({ where: { userId: identity.userId } });
  const passkeyCount = await prisma.passkey.count({ where: { userId: identity.userId } });
  const remaining = oauthCount + (ssoCount - 1) + passkeyCount + (user?.passwordHash ? 1 : 0);
  if (remaining < 1) {
    return res.status(409).json({ success: false, error: "Cannot remove your only sign-in method" });
  }
  const enforced = await isAccountSsoForced(identity.userId);
  if (enforced) {
    return res.status(409).json({ success: false, error: "Your account requires this SSO sign-in method" });
  }
  await prisma.enterpriseSsoIdentity.delete({ where: { id: identity.id } });
  res.json({ success: true, data: { removed: true } });
});

export default router;