import { Router, type Request, type Response } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import crypto from "crypto";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { buildVerifyEmail, sendEmail } from "../lib/email.js";
import { getEnv } from "../config/env.js";
import { requireAuth } from "../middleware/auth.js";
import { isRegistrationProbeAllowed, authRateLimit, recordRegProbe } from "../middleware/rateLimit.js";
import { isIpAbuseWhitelisted } from "../lib/antiAbuseWhitelist.js";
import {
  buildAuthorizeUrl,
  exchangeAuthCode,
  fetchProviderProfile,
  getSsoClientCredentials,
  pkceChallenge,
  ssoProvidersEnabled,
  type OAuthProvider,
} from "../lib/oauth.js";
import {
  applyInviteeDiscount,
  ensureReferralEdge,
  detectInviteAbuse,
  fingerprintHashes,
  type AbuseAction,
  type ClaimFingerprint,
} from "../lib/affiliateService.js";
import { adoptGuestPurchase, guestPurchaseOrderId } from "../lib/inviteOrders.js";
import type { InviteDb } from "../lib/inviteService.js";
import { dispatchWebhookEvent } from "../lib/webhook.js";
import { isAccountSsoForced, ssoForceBlocksLogin } from "../lib/ssoEnforcement.js";
import { signToken, signTwoFactorToken, userPublic } from "./auth.js";
import { isReservedSlug } from "../lib/reservedSlugs.js";
import { getPocketbaseConfig } from "../lib/pocketbase/config.js";
import { confirmCollectionAuth, type PbAuthRecordIdentity } from "../lib/pocketbase/client.js";

const router = Router();

type OAuthMode = "login" | "signup" | "link";

/**
 * Linkable identity providers. PocketBase is not a redirect-based provider —
 * it hands sign-in through a token exchange — but its `OAuthAccount` rows use
 * `provider = "pocketbase"` so accounts, Security-tab linking and unlink all
 * reuse the existing SSO storage the social providers use.
 */
type LinkableProvider = OAuthProvider | "pocketbase";
const PB_PROVIDER: LinkableProvider = "pocketbase";

interface OAuthStatePayload {
  purpose: "oauth_state";
  provider: OAuthProvider;
  mode: OAuthMode;
  verifier: string;
  invite?: string;
  linkUserId?: string;
}

interface OAuthExchangePayload {
  purpose: "oauth_exchange";
  provider: LinkableProvider;
  id: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
  avatar: string | null;
  mode: OAuthMode;
  invite?: string;
}

interface OAuthSignupPayload {
  purpose: "oauth_signup";
  provider: LinkableProvider;
  id: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
  avatar: string | null;
  invite?: string;
}

const STATE_COOKIE = "oauth_state";
const STATE_TTL_SECONDS = 10 * 60;
const EXCHANGE_TTL_SECONDS = 10 * 60;
const SIGNUP_TTL_SECONDS = 15 * 60;

function oauthJwt<T>(payload: T, expiresInSeconds: number): string {
  return jwt.sign(payload as jwt.JwtPayload, getEnv().JWT_SECRET, {
    expiresIn: expiresInSeconds,
  });
}

function verifyOauthJwt<T>(token: string, purpose: string): T | null {
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

function ssoRedirectUri(): string {
  const configured = getEnv().SSO_CALLBACK_URL;
  if (configured) return configured;
  return `${appUrl()}/api/auth/oauth/callback`;
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
    path: "/api/auth/oauth/callback",
    maxAge: STATE_TTL_SECONDS * 1000,
  });
}

function clearStateCookie(res: Response) {
  res.clearCookie(STATE_COOKIE, { path: "/api/auth/oauth/callback" });
}

const startSchema = z.object({
  provider: z.enum(["google", "github", "discord"]),
  mode: z.enum(["login", "signup", "link"]).default("login"),
  invite: z.string().trim().max(128).optional(),
  returnPath: z.string().max(512).optional(),
});

router.get("/config", (_req, res) => {
  const env = getEnv();
  res.json({
    success: true,
    data: {
      providers: ssoProvidersEnabled(env),
      signupRequiresInvite: env.SSO_SIGNUP_REQUIRES_INVITE,
      twoFactorBypassAllowed: env.SSO_2FA_BYPASS_ALLOWED,
    },
  });
});

router.post("/start", async (req, res) => {
  const parsed = startSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: parsed.error.issues[0].message });
  }

  const { provider, mode, invite, returnPath } = parsed.data;
  const creds = getSsoClientCredentials(provider, getEnv());
  if (!creds) {
    return res.status(400).json({ success: false, error: `${provider} sign-in is not configured` });
  }

  let linkUserId: string | undefined;
  if (mode === "link") {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({ success: false, error: "Login required to link an account" });
    }
    try {
      const payload = jwt.verify(authHeader.slice(7), getEnv().JWT_SECRET) as {
        userId?: string;
        purpose?: string;
      };
      if (!payload.userId || payload.purpose !== "auth") {
        return res.status(401).json({ success: false, error: "Invalid token" });
      }
      linkUserId = payload.userId;
    } catch {
      return res.status(401).json({ success: false, error: "Invalid token" });
    }
  }

  const { verifier, challenge } = pkceChallenge();
  const state = oauthJwt<OAuthStatePayload>(
    { purpose: "oauth_state", provider, mode, verifier, invite, linkUserId },
    STATE_TTL_SECONDS
  );
  setStateCookie(req, res, state);

  const redirectUrl = buildAuthorizeUrl({
    provider,
    clientId: creds.clientId,
    redirectUri: ssoRedirectUri(),
    state,
    codeChallenge: challenge,
  });

  if (returnPath) res.cookie("oauth_return", returnPath, { path: "/api/auth/oauth/callback", maxAge: STATE_TTL_SECONDS * 1000, sameSite: "lax" });

  res.json({ success: true, data: { redirectUrl } });
});

router.get("/callback", async (req, res) => {
  const queryProvider = String(req.query.provider ?? "");
  const code = String(req.query.code ?? "");
  const providerError = String(req.query.error ?? "");
  const state = String(req.query.state ?? "");
  const cookieState = readStateCookie(req);

  const fail = (error: string) => {
    clearStateCookie(res);
    res.clearCookie("oauth_return", { path: "/api/auth/oauth/callback" });
    res.redirect(frontendPath(`/oauth/callback?${new URLSearchParams({ error })}`));
  };

  if (providerError) {
    return fail(providerError === "access_denied" ? "Authorization was cancelled." : `Provider error: ${providerError}`);
  }

  if (!code) {
    return fail("Missing OAuth response");
  }

  const statePayload = verifyOauthJwt<OAuthStatePayload>(state, "oauth_state");
  if (
    !statePayload ||
    !cookieState ||
    cookieState !== state ||
    (queryProvider !== "" && queryProvider !== statePayload.provider)
  ) {
    return fail("Invalid OAuth request");
  }

  const creds = getSsoClientCredentials(statePayload.provider, getEnv());
  if (!creds) {
    return fail(`${statePayload.provider} sign-in is not configured`);
  }

  clearStateCookie(res);
  res.clearCookie("oauth_return", { path: "/api/auth/oauth/callback" });

  try {
    const accessToken = await exchangeAuthCode(
      statePayload.provider,
      {
        code,
        codeVerifier: statePayload.verifier,
        clientId: creds.clientId,
        clientSecret: creds.clientSecret,
        redirectUri: ssoRedirectUri(),
      }
    );
    const profile = await fetchProviderProfile(statePayload.provider, accessToken);

    if (statePayload.mode === "link" && statePayload.linkUserId) {
      const existing = await prisma.oAuthAccount.findUnique({
        where: { provider_providerAccountId: { provider: statePayload.provider, providerAccountId: profile.id } },
      });
      if (existing && existing.userId !== statePayload.linkUserId) {
        return fail("This provider account is already linked to another account");
      }
      if (!existing) {
        await prisma.oAuthAccount.create({
          data: {
            userId: statePayload.linkUserId,
            provider: statePayload.provider,
            providerAccountId: profile.id,
            email: profile.email,
            emailVerified: profile.emailVerified,
            displayName: profile.name,
            avatarUrl: profile.avatar,
          },
        });
      }
      return res.redirect(frontendPath(`/oauth/callback?result=linked&provider=${statePayload.provider}`));
    }

    const exchange = oauthJwt<OAuthExchangePayload>(
      {
        purpose: "oauth_exchange",
        provider: statePayload.provider,
        id: profile.id,
        email: profile.email,
        emailVerified: profile.emailVerified,
        name: profile.name,
        avatar: profile.avatar,
        mode: statePayload.mode,
        invite: statePayload.invite,
      },
      EXCHANGE_TTL_SECONDS
    );

    res.redirect(frontendPath(`/oauth/callback?code=${encodeURIComponent(exchange)}`));
  } catch {
    fail("Could not complete provider login");
  }
});

const exchangeSchema = z.object({
  code: z.string().min(1),
});

function makeUsernameSeed(email: string | null, name: string | null): string {
  const source = email ? email.split("@")[0] : name;
  let base = (source ?? "user").toLowerCase().replace(/[^a-z0-9_-]/g, "").replace(/^[-_]+|[-_]+$/g, "");
  if (!base) base = "user";
  if (base.length < 3) base = base.padEnd(3, "0");
  return base.slice(0, 32);
}

const CANDIDATE_MAX = 50;

async function uniqueUsername(
  tx: Prisma.TransactionClient,
  base: string
): Promise<string> {
  let candidate = base;
  let attempt = 1;
  while (attempt < CANDIDATE_MAX) {
    if (!isReservedSlug(candidate)) {
      const exists = await tx.user.findUnique({ where: { username: candidate }, select: { id: true } });
      if (!exists) return candidate;
    }
    const suffix = String(attempt);
    candidate = `${base.slice(0, 32 - suffix.length)}${suffix}`;
    attempt += 1;
  }
  const random = crypto.randomBytes(3).toString("hex");
  return `${base.slice(0, 29)}${random}`;
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
  oauthBypass2fa: boolean;
}

async function issueLoginResponse(res: Response, user: LocalUser, bypass2fa: boolean) {
  const passkeyCount = await prisma.passkey.count({ where: { userId: user.id } });
  const requiresTwoFactor = user.totpEnabled || passkeyCount > 0;
  if (requiresTwoFactor && !bypass2fa) {
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

router.post("/exchange", async (req, res) => {
  const parsed = exchangeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: parsed.error.issues[0].message });
  }

  const payload = verifyOauthJwt<OAuthExchangePayload>(parsed.data.code, "oauth_exchange");
  if (!payload) {
    return res.status(400).json({ success: false, error: "Invalid or expired login session" });
  }

  const env = getEnv();

  const account = await prisma.oAuthAccount.findUnique({
    where: { provider_providerAccountId: { provider: payload.provider, providerAccountId: payload.id } },
    include: { user: true },
  });

  if (account) {
    await prisma.oAuthAccount
      .update({
        where: { id: account.id },
        data: {
          email: payload.email,
          emailVerified: payload.emailVerified,
          displayName: payload.name,
          avatarUrl: payload.avatar,
        },
      })
      .catch(() => {});
    if (!(await ssoForceBlocksLogin(res, account.user.id))) return;
    const bypass = env.SSO_2FA_BYPASS_ALLOWED && account.user.oauthBypass2fa;
    return issueLoginResponse(res, account.user, bypass);
  }

  if (payload.mode === "signup" || payload.mode === "login") {
    if (payload.email && payload.emailVerified) {
      const existingUser = await prisma.user.findUnique({ where: { email: payload.email.toLowerCase() } });
      if (existingUser) {
        if (await isAccountSsoForced(existingUser.id)) {
          return res.status(403).json({
            success: false,
            error: "This account requires sign-in via enterprise SSO",
          });
        }

        // A3b — the platform account has never verified its email: the caller
        // proving control of the matched address through a provider-verified
        // identity is the verification itself (double-opt-in via SSO), not a
        // silent takeover. Link the provider, mark the account verified and
        // sign in. Only UNVERIFIED accounts take this path.
        if (!existingUser.emailVerified) {
          await prisma.$transaction(async (tx) => {
            await tx.oAuthAccount.upsert({
              where: {
                provider_providerAccountId: {
                  provider: payload.provider,
                  providerAccountId: payload.id,
                },
              },
              create: {
                userId: existingUser.id,
                provider: payload.provider,
                providerAccountId: payload.id,
                email: payload.email,
                emailVerified: true,
                displayName: payload.name,
                avatarUrl: payload.avatar,
              },
              update: {
                userId: existingUser.id,
                email: payload.email,
                emailVerified: true,
                displayName: payload.name,
                avatarUrl: payload.avatar,
              },
            });
            await tx.user.update({
              where: { id: existingUser.id },
              data: { emailVerified: true, emailVerifiedAt: new Date() },
            });
          });

          if (!(await ssoForceBlocksLogin(res, existingUser.id))) return;
          const bypass = env.SSO_2FA_BYPASS_ALLOWED && existingUser.oauthBypass2fa;
          return issueLoginResponse(res, existingUser, bypass);
        }

        // A2 — never silently attach a NEW provider identity to an existing
        // account just because the provider reports a matching verified email.
        // The caller has only proven control of the PROVIDER identity (whose
        // email address is self-reported by that provider but whose account is
        // unknown to this platform), not control of the existing platform
        // account. Auto-linking here would silently log the caller into an
        // account they do not own. Linking must be an explicit, authenticated
        // action: sign in to the platform account first, then use
        // `/oauth/start` with `mode: link` (or the link-token flow) from the
        // Security tab. Already-linked identities never reach this branch —
        // they are handled by the `account` lookup above and keep signing in.
        return res.status(409).json({
          success: false,
          error: "An account with this email already exists. Sign in to it and link this provider from the Security tab.",
        });
      }

      const invite = payload.invite?.trim() || null;
      const requiresInvite = env.SSO_SIGNUP_REQUIRES_INVITE && !invite;
      if (requiresInvite) {
        return res.json({
          success: true,
          data: {
            status: "needs_setup",
            signupToken: oauthJwt<OAuthSignupPayload>(
              {
                purpose: "oauth_signup",
                provider: payload.provider,
                id: payload.id,
                email: payload.email,
                emailVerified: true,
                name: payload.name,
                avatar: payload.avatar,
              },
              SIGNUP_TTL_SECONDS
            ),
            provider: payload.provider,
            name: payload.name,
            avatar: payload.avatar,
            email: payload.email,
            requiresEmail: false,
            requiresInvite: true,
            suggestedUsername: makeUsernameSeed(payload.email, payload.name),
          },
        });
      }

      const userRole = await prisma.role.findUnique({ where: { slug: "user" }, select: { id: true } });
      if (!userRole) {
        return res.status(500).json({ success: false, error: "Default role not configured" });
      }

      try {
        const created = await prisma.$transaction(async (tx) => {
          const fingerprint = req.authFingerprint
            ? { ip: req.authFingerprint.ip, cookie: req.authFingerprint.cookie, userAgent: req.authFingerprint.userAgent }
            : null;

          let abused: "referral" | "invite" | null = null;
          let abuseAction: AbuseAction = "reject";
          if (invite) {
            const code = await tx.inviteCode.findUnique({ where: { code: invite } });
            if (!code) throw new InviteError("Invite code is invalid");
            if (code.usedById) throw new InviteError("Invite code has already been used");
            if (code.revokedAt) throw new InviteError("Invite code has been revoked");
            if (code.expiresAt && code.expiresAt < new Date()) throw new InviteError("Invite code has expired");
            if (fingerprint) {
              const abuse = await detectInviteAbuse(tx, fingerprint, code.createdById);
              if (abuse) {
                abused = abuse.reason;
                abuseAction = abuse.action;
                if (abuse.action === "reject") {
                  throw new InviteError("This invite has already been used from this device or network.", 409);
                }
              }
            }
          }

          const fpHashes = fingerprint ? fingerprintHashes(fingerprint) : null;
          const username = await uniqueUsername(tx, makeUsernameSeed(payload.email, payload.name));

          // Usernames become profile slugs in the shared slug namespace, so a
          // collision with an existing alias must fail the whole transaction.
          const autoAliasClash = await tx.profileAlias.findUnique({ where: { slug: username }, select: { id: true } });
          if (autoAliasClash) throw new InviteError("Username conflicts with an existing alias", 400);

          const u = await tx.user.create({
            data: {
              username,
              email: payload.email!.toLowerCase(),
              emailVerified: true,
              emailVerifiedAt: new Date(),
              passwordHash: await bcrypt.hash(crypto.randomBytes(24).toString("hex"), 12),
              roleId: userRole.id,
              registeredIp: fpHashes?.ip ?? null,
              registeredFingerprint: fpHashes?.cookie ?? null,
              registeredUserAgentHash: fpHashes?.userAgentHash ?? null,
            },
          });

          const primary = await tx.profile.create({ data: { userId: u.id, slug: username, isPrimary: true } });
          await tx.slugNamespace.create({
            data: { slug: username, kind: "profile", profileId: primary.id },
          });

          await tx.oAuthAccount.create({
            data: {
              userId: u.id,
              provider: payload.provider,
              providerAccountId: payload.id,
              email: payload.email,
              emailVerified: true,
              displayName: payload.name,
              avatarUrl: payload.avatar,
            },
          });

          if (invite) {
            const code = await tx.inviteCode.findUnique({ where: { code: invite } });
            if (!code || code.usedById || code.revokedAt) {
              throw new InviteError("Invite code has already been used");
            }
            // Atomic conditional consume (same pattern as local register): the
            // UPDATE re-checks `usedById IS NULL` so two concurrent signups can
            // never both consume the same code; only one gets a non-zero count.
            const consumed = await tx.inviteCode.updateMany({
              where: { id: code.id, usedById: null, revokedAt: null },
              data: { usedById: u.id, usedAt: new Date() },
            });
            if (consumed.count !== 1) {
              throw new InviteError("Invite code has already been used");
            }
            if (code.createdById && !abused) {
              await ensureReferralEdge(u.id, code.createdById, tx);
              await applyInviteeDiscount(u.id, tx);
            }

            // A guest purchase is delivered as codes rather than as a balance, so
            // redeeming one is what proves the holder is the buyer; the remaining
            // codes of that purchase are adopted by the new account.
            const purchasedOrderId = guestPurchaseOrderId(code.note);
            if (purchasedOrderId) {
              await adoptGuestPurchase(u.id, purchasedOrderId, tx as unknown as InviteDb);
            }
          }

          return { u, abused, abuseAction };
        });

        dispatchWebhookEvent(created.u.id, "user.registered", {
          userId: created.u.id,
          username: created.u.username,
          registeredAt: new Date().toISOString(),
        });

        const token = await signToken(created.u.id, env.JWT_EXPIRES_IN);
        return res.status(201).json({
          success: true,
          data: { status: "logged_in", token, user: await userPublic(created.u) },
        });
      } catch (err) {
        if (err instanceof InviteError) {
          if (err.status === 409) {
            return res.status(409).json({ success: false, error: err.message });
          }
          return res.status(400).json({ success: false, error: err.message });
        }
        throw err;
      }
    }

    const emailProvided = Boolean(payload.email);
    const invite = payload.invite?.trim() || null;
    const requiresInvite = env.SSO_SIGNUP_REQUIRES_INVITE && !invite;

    if (payload.email) {
      const existingUser = await prisma.user.findUnique({ where: { email: payload.email.toLowerCase() } });
      if (existingUser) {
        return res.status(409).json({
          success: false,
          error: "An account with this email already exists. Sign in and link this provider in the Security tab.",
        });
      }
    }
    if (payload.email && !payload.emailVerified && !requiresInvite) {
      return res.json({
        success: true,
        data: {
          status: "needs_setup",
          signupToken: oauthJwt<OAuthSignupPayload>(
            {
              purpose: "oauth_signup",
              provider: payload.provider,
              id: payload.id,
              email: payload.email,
              emailVerified: payload.emailVerified,
              name: payload.name,
              avatar: payload.avatar,
              invite: invite ?? undefined,
            },
            SIGNUP_TTL_SECONDS
          ),
          provider: payload.provider,
          name: payload.name,
          avatar: payload.avatar,
          email: payload.email,
          requiresEmail: false,
          requiresInvite,
          suggestedUsername: makeUsernameSeed(payload.email, payload.name),
        },
      });
    }

    if (payload.email && !payload.emailVerified && requiresInvite) {
      return res.json({
        success: true,
        data: {
          status: "needs_setup",
          signupToken: oauthJwt<OAuthSignupPayload>(
            {
              purpose: "oauth_signup",
              provider: payload.provider,
              id: payload.id,
              email: payload.email,
              emailVerified: payload.emailVerified,
              name: payload.name,
              avatar: payload.avatar,
              invite: invite ?? undefined,
            },
            SIGNUP_TTL_SECONDS
          ),
          provider: payload.provider,
          name: payload.name,
          avatar: payload.avatar,
          email: payload.email,
          requiresEmail: false,
          requiresInvite,
          suggestedUsername: makeUsernameSeed(payload.email, payload.name),
        },
      });
    }

    return res.json({
      success: true,
      data: {
        status: "needs_setup",
        signupToken: oauthJwt<OAuthSignupPayload>(
          {
            purpose: "oauth_signup",
            provider: payload.provider,
            id: payload.id,
            email: payload.email,
            emailVerified: payload.emailVerified,
            name: payload.name,
            avatar: payload.avatar,
            invite: invite ?? undefined,
          },
          SIGNUP_TTL_SECONDS
        ),
        provider: payload.provider,
        name: payload.name,
        avatar: payload.avatar,
        email: payload.email,
        requiresEmail: !emailProvided,
        requiresInvite,
        suggestedUsername: makeUsernameSeed(payload.email, payload.name),
      },
    });
  }

  return res.status(400).json({ success: false, error: "Invalid OAuth session" });
});

const signupSchema = z.object({
  signupToken: z.string().min(1),
  username: z
    .string({ required_error: "Username is required" })
    .min(3, "Username must be at least 3 characters")
    .max(32, "Username must be 32 characters or fewer")
    .regex(/^[a-z0-9_-]+$/, "Username can only contain lowercase letters, numbers, underscores, and hyphens")
    .refine((u) => !isReservedSlug(u), "That username is reserved"),
  email: z
    .string()
    .trim()
    .min(1, "Email is required")
    .max(254, "Email must be 254 characters or fewer")
    .email("Email must be a valid email address")
    .optional(),
  inviteCode: z.string().trim().min(1).max(128).optional(),
});

class InviteError extends Error {
  constructor(message: string, public status: number = 400) {
    super(message);
  }
}

function fieldErrors(error: z.ZodError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = issue.path[0];
    if (typeof field === "string" && !result[field]) {
      result[field] = issue.message;
    }
  }
  return result;
}

router.post("/signup", async (req, res) => {
  const fingerprint = req.authFingerprint;
  if (fingerprint?.ip) {
    const allowlisted = await isIpAbuseWhitelisted(fingerprint.ip);
    if (!allowlisted && !isRegistrationProbeAllowed(fingerprint.ip)) {
      return res.status(429).json({
        success: false,
        error: "Too many registration attempts. Please try again later.",
      });
    }
  }

  const parsed = signupSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: "Please fix the highlighted fields.",
      fieldErrors: fieldErrors(parsed.error),
    });
  }

  const payload = verifyOauthJwt<OAuthSignupPayload>(parsed.data.signupToken, "oauth_signup");
  if (!payload) {
    return res.status(400).json({ success: false, error: "Sign-up session expired. Try again." });
  }

  const env = getEnv();
  // A3a — only a provider-verified address may become a VERIFIED account
  // email. A self-typed email (completion form when the provider returned
  // none) is stored on the account as UNVERIFIED so it can never be used as
  // an identity until a signed link proves mailbox control (A3b). An account
  // with an unverified email cannot sign in, so squatting another person's
  // address here yields an unusable account, not a means of impersonation.
  const providerEmail = payload.email?.toLowerCase() ?? null;
  const typedEmail = parsed.data.email?.trim().toLowerCase() || null;
  const email = typedEmail ?? providerEmail;
  if (!email) {
    return res.status(400).json({
      success: false,
      error: "Please fix the highlighted fields.",
      fieldErrors: { email: "Email is required" },
    });
  }
  const emailVerified = Boolean(payload.emailVerified && providerEmail && email === providerEmail);

  const invite = parsed.data.inviteCode?.trim() || payload.invite?.trim() || null;
  const requiresInvite = env.SSO_SIGNUP_REQUIRES_INVITE && !invite;
  if (requiresInvite) {
    return res.status(400).json({
      success: false,
      error: "Please fix the highlighted fields.",
      fieldErrors: { inviteCode: "Invite code is required" },
    });
  }

  const userRole = await prisma.role.findUnique({ where: { slug: "user" }, select: { id: true } });
  if (!userRole) {
    return res.status(500).json({ success: false, error: "Default role not configured" });
  }

  try {
    const created = await prisma.$transaction(async (tx) => {
      const fingerprint = req.authFingerprint
        ? { ip: req.authFingerprint.ip, cookie: req.authFingerprint.cookie, userAgent: req.authFingerprint.userAgent }
        : null;

      let abused: "referral" | "invite" | null = null;
      let abuseAction: AbuseAction = "reject";
      if (invite) {
        const code = await tx.inviteCode.findUnique({ where: { code: invite } });
        if (!code) throw new InviteError("Invite code is invalid");
        if (code.usedById) throw new InviteError("Invite code has already been used");
        if (code.revokedAt) throw new InviteError("Invite code has been revoked");
        if (code.expiresAt && code.expiresAt < new Date()) throw new InviteError("Invite code has expired");
        if (fingerprint) {
          const abuse = await detectInviteAbuse(tx, fingerprint, code.createdById);
          if (abuse) {
            abused = abuse.reason;
            abuseAction = abuse.action;
            if (abuse.action === "reject") {
              throw new InviteError("This invite has already been used from this device or network.", 409);
            }
          }
        }
      }

      const existing = await tx.user.findFirst({
        where: { OR: [{ email }, { username: parsed.data.username }] },
        select: { id: true },
      });
      if (existing) throw new InviteError("Username or email is already taken", 409);

      const aliasClash = await tx.profileAlias.findUnique({ where: { slug: parsed.data.username }, select: { id: true } });
      if (aliasClash) throw new InviteError("Username or email is already taken", 409);

      const fpHashes = fingerprint ? fingerprintHashes(fingerprint) : null;

      const u = await tx.user.create({
        data: {
          username: parsed.data.username,
          email,
          emailVerified,
          emailVerifiedAt: emailVerified ? new Date() : null,
          passwordHash: await bcrypt.hash(crypto.randomBytes(24).toString("hex"), 12),
          roleId: userRole.id,
          registeredIp: fpHashes?.ip ?? null,
          registeredFingerprint: fpHashes?.cookie ?? null,
          registeredUserAgentHash: fpHashes?.userAgentHash ?? null,
        },
      });

      const primary = await tx.profile.create({ data: { userId: u.id, slug: parsed.data.username, isPrimary: true } });
      await tx.slugNamespace.create({
        data: { slug: parsed.data.username, kind: "profile", profileId: primary.id },
      });

      await tx.oAuthAccount.create({
        data: {
          userId: u.id,
          provider: payload.provider,
          providerAccountId: payload.id,
          email,
          emailVerified,
          displayName: payload.name,
          avatarUrl: payload.avatar,
        },
      });

      if (invite) {
        const code = await tx.inviteCode.findUnique({ where: { code: invite } });
        if (!code || code.usedById || code.revokedAt) {
          throw new InviteError("Invite code has already been used");
        }
        // Atomic conditional consume (same pattern as local register): the
        // UPDATE re-checks `usedById IS NULL` so two concurrent signups can
        // never both consume the same code; only one gets a non-zero count.
        const consumed = await tx.inviteCode.updateMany({
          where: { id: code.id, usedById: null, revokedAt: null },
          data: { usedById: u.id, usedAt: new Date() },
        });
        if (consumed.count !== 1) {
          throw new InviteError("Invite code has already been used");
        }
        if (code.createdById && !abused) {
          await ensureReferralEdge(u.id, code.createdById, tx);
          await applyInviteeDiscount(u.id, tx);
        }

        // A guest purchase is delivered as codes rather than as a balance, so
        // redeeming one is what proves the holder is the buyer; the remaining
        // codes of that purchase are adopted by the new account.
        const purchasedOrderId = guestPurchaseOrderId(code.note);
        if (purchasedOrderId) {
          await adoptGuestPurchase(u.id, purchasedOrderId, tx as unknown as InviteDb);
        }
      }

      return { u, abused, abuseAction };
    });

    dispatchWebhookEvent(created.u.id, "user.registered", {
      userId: created.u.id,
      username: created.u.username,
      registeredAt: new Date().toISOString(),
    });

    // A3b — only an account whose email was provider-verified can be signed in
    // immediately. A self-typed (unverified) address leaves the account dead
    // until a signed email link proves mailbox control; no session is issued.
    if (created.u.emailVerified) {
      const token = await signToken(created.u.id, env.JWT_EXPIRES_IN);
      return res.status(201).json({
        success: true,
        data: { token, user: await userPublic(created.u) },
      });
    }

    const verifyToken = jwt.sign(
      { userId: created.u.id, email: created.u.email, purpose: "email_verify" },
      env.JWT_SECRET,
      { expiresIn: `${env.EMAIL_VERIFY_TOKEN_TTL_HOURS}h` as jwt.SignOptions["expiresIn"] }
    );
    const verifyUrl = `${env.CORS_ORIGIN}/verify-email?token=${encodeURIComponent(verifyToken)}`;
    const emailResult = await sendEmail({
      to: created.u.email,
      subject: `Confirm your ${env.SMTP_FROM_NAME} account`,
      html: buildVerifyEmail({
        appName: env.SMTP_FROM_NAME,
        username: created.u.username,
        verifyUrl,
      }),
    });

    const warning =
      created.abused === "referral"
        ? "Referral skipped: this device/network has already used an invite from this creator."
        : created.abused === "invite"
          ? "Invite registered without referral: this device/network has already used an invite."
          : undefined;

    return res.status(201).json({
      success: true,
      data: { status: "verification_required", emailSent: emailResult.success, ...(warning ? { warning } : {}) },
    });
  } catch (err) {
    if (err instanceof InviteError) {
      if (err.status === 409) {
        if (req.authFingerprint?.ip) recordRegProbe(req.authFingerprint.ip);
        return res.status(409).json({ success: false, error: err.message });
      }
      return res.status(400).json({ success: false, error: err.message });
    }
    throw err;
  }
});

router.get("/accounts", requireAuth, async (req, res) => {
  const userId = req.userId as string;
  const accounts = await prisma.oAuthAccount.findMany({
    where: { userId },
    select: {
      id: true,
      provider: true,
      providerAccountId: true,
      email: true,
      displayName: true,
      avatarUrl: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { passwordHash: true, oauthBypass2fa: true },
  });

  const passkeyCount = await prisma.passkey.count({ where: { userId } });

  res.json({
    success: true,
    data: {
      accounts,
      oauthBypass2fa: user?.oauthBypass2fa ?? false,
      twoFactorBypassAllowed: getEnv().SSO_2FA_BYPASS_ALLOWED,
      authMethods: {
        password: Boolean(user?.passwordHash),
        oauth: accounts.length,
        passkeys: passkeyCount,
      },
    },
  });
});

const PROVIDERS_SET = new Set<LinkableProvider>(["google", "github", "discord", "pocketbase"]);

router.delete("/accounts/:provider/:providerAccountId", requireAuth, async (req, res) => {
  const provider = String(req.params.provider);
  const providerAccountId = String(req.params.providerAccountId);
  if (!PROVIDERS_SET.has(provider as LinkableProvider)) {
    return res.status(400).json({ success: false, error: "Unknown provider" });
  }

  const userId = req.userId as string;
  const account = await prisma.oAuthAccount.findUnique({
    where: { provider_providerAccountId: { provider, providerAccountId } },
  });
  if (!account || account.userId !== userId) {
    return res.status(404).json({ success: false, error: "Provider account not found" });
  }

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true } });
  const oauthCount = await prisma.oAuthAccount.count({ where: { userId } });
  const passkeyCount = await prisma.passkey.count({ where: { userId } });
  const remaining = oauthCount - 1 + passkeyCount + (user?.passwordHash ? 1 : 0);
  if (remaining < 1) {
    return res.status(409).json({
      success: false,
      error: "Cannot remove your only sign-in method",
    });
  }

  await prisma.oAuthAccount.delete({ where: { id: account.id } });
  res.json({ success: true, data: { removed: true } });
});

const settingsSchema = z.object({
  oauthBypass2fa: z.boolean(),
});

router.put("/settings", requireAuth, async (req, res) => {
  const parsed = settingsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: parsed.error.issues[0].message });
  }
  if (!getEnv().SSO_2FA_BYPASS_ALLOWED) {
    return res.status(403).json({
      success: false,
      error: "This instance does not permit skipping 2FA through social sign-in",
    });
  }

  await prisma.user.update({
    where: { id: req.userId },
    data: { oauthBypass2fa: parsed.data.oauthBypass2fa },
  });

  res.json({ success: true, data: { oauthBypass2fa: parsed.data.oauthBypass2fa } });
});

// ---- PocketBase token-handoff OAuth ---------------------------------------

const pocketbaseTokenSchema = z.object({
  // PB auth tokens (JWT) are far longer than 20 chars; the bound keeps garbage
  // out while still accepting every real token.
  token: z.string().min(20, "Invalid PocketBase session").max(4096, "Invalid PocketBase session"),
});

const pocketbaseExchangeSchema = pocketbaseTokenSchema.extend({
  invite: z.string().trim().min(1).max(128).optional(),
});

/** Validated PB identity passed through the invite/abuse gates shared by local
 * registration so a verified PocketBase token can provision an account. */
interface ProvisionOAuthIdentityInput {
  provider: LinkableProvider;
  id: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
  avatarUrl: string | null;
  invite: string | null;
  fingerprint: ClaimFingerprint | null;
  userRoleId: string;
}

/**
 * Provision a brand-new platform account for a caller-verified provider
 * identity (social SSO or PocketBase token-handoff). Invite validation, atomic
 * single-consumption, referral edges and invitee discounts mirror local
 * registration so the invite gate can never be raced by concurrent signups.
 */
async function provisionOAuthIdentity(
  tx: Prisma.TransactionClient,
  input: ProvisionOAuthIdentityInput
) {
  let abused: "referral" | "invite" | null = null;
  if (input.invite) {
    const code = await tx.inviteCode.findUnique({ where: { code: input.invite } });
    if (!code) throw new InviteError("Invite code is invalid");
    if (code.usedById) throw new InviteError("Invite code has already been used");
    if (code.revokedAt) throw new InviteError("Invite code has been revoked");
    if (code.expiresAt && code.expiresAt < new Date()) throw new InviteError("Invite code has expired");
    if (input.fingerprint) {
      const abuse = await detectInviteAbuse(tx, input.fingerprint, code.createdById);
      if (abuse) {
        abused = abuse.reason;
        if (abuse.action === "reject") {
          throw new InviteError("This invite has already been used from this device or network.", 409);
        }
      }
    }
  }

  const fpHashes = input.fingerprint ? fingerprintHashes(input.fingerprint) : null;
  const username = await uniqueUsername(tx, makeUsernameSeed(input.email, input.name));

  // Usernames become profile slugs in the shared slug namespace, so a clash
  // with an existing alias must fail the whole transaction.
  const autoAliasClash = await tx.profileAlias.findUnique({ where: { slug: username }, select: { id: true } });
  if (autoAliasClash) throw new InviteError("Username conflicts with an existing alias", 400);

  const u = await tx.user.create({
    data: {
      username,
      email: input.email.toLowerCase(),
      emailVerified: input.emailVerified,
      emailVerifiedAt: input.emailVerified ? new Date() : null,
      passwordHash: await bcrypt.hash(crypto.randomBytes(24).toString("hex"), 12),
      roleId: input.userRoleId,
      registeredIp: fpHashes?.ip ?? null,
      registeredFingerprint: fpHashes?.cookie ?? null,
      registeredUserAgentHash: fpHashes?.userAgentHash ?? null,
    },
  });

  const primary = await tx.profile.create({ data: { userId: u.id, slug: username, isPrimary: true } });
  await tx.slugNamespace.create({ data: { slug: username, kind: "profile", profileId: primary.id } });

  await tx.oAuthAccount.create({
    data: {
      userId: u.id,
      provider: input.provider,
      providerAccountId: input.id,
      email: input.email,
      emailVerified: input.emailVerified,
      displayName: input.name,
      avatarUrl: input.avatarUrl,
    },
  });

  if (input.invite) {
    const code = await tx.inviteCode.findUnique({ where: { code: input.invite } });
    if (!code || code.usedById || code.revokedAt) {
      throw new InviteError("Invite code has already been used");
    }
    // Atomic conditional consume: the UPDATE re-checks `usedById IS NULL` so
    // two concurrent signups can never both consume the same code.
    const consumed = await tx.inviteCode.updateMany({
      where: { id: code.id, usedById: null, revokedAt: null },
      data: { usedById: u.id, usedAt: new Date() },
    });
    if (consumed.count !== 1) {
      throw new InviteError("Invite code has already been used");
    }
    if (code.createdById && !abused) {
      await ensureReferralEdge(u.id, code.createdById, tx);
      await applyInviteeDiscount(u.id, tx);
    }

    // A guest purchase is delivered as codes rather than as a balance, so
    // redeeming one is what proves the holder is the buyer; the remaining
    // codes of that purchase are adopted by the new account.
    const purchasedOrderId = guestPurchaseOrderId(code.note);
    if (purchasedOrderId) {
      await adoptGuestPurchase(u.id, purchasedOrderId, tx as unknown as InviteDb);
    }
  }

  return u;
}

/** Public capabilities the browser needs before it can show the PB button. */
router.get("/pocketbase/config", async (_req, res) => {
  const cfg = getPocketbaseConfig();
  if (!cfg.enabled) {
    return res.json({ success: true, data: { enabled: false } });
  }
  const env = getEnv();
  res.json({
    success: true,
    data: {
      enabled: cfg.oauthEnabled,
      clientUrl: cfg.clientUrl,
      authCollection: cfg.authCollection,
      signupRequiresInvite: env.SSO_SIGNUP_REQUIRES_INVITE,
      twoFactorBypassAllowed: env.SSO_2FA_BYPASS_ALLOWED,
    },
  });
});

/**
 * Token-handoff exchange (the PocketBase analogue of `/exchange`). The browser
 * signed in at PocketBase itself (email + password leave this backend) and
 * now hands the resulting PB auth token here for server-side proof.
 *
 * Flow: linked identity → sign in; PB-verified email already on an account →
 * auto-link and sign in; otherwise → needs_setup (invite gate consulted, the
 * `/oauth/signup` completion endpoint provisions the account).
 */
router.post("/pocketbase/exchange", authRateLimit, async (req, res) => {
  const cfg = getPocketbaseConfig();
  if (!cfg.enabled || !cfg.oauthEnabled) {
    return res.status(404).json({ success: false, error: "PocketBase sign-in is not enabled on this instance" });
  }
  const parsed = pocketbaseExchangeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: parsed.error.issues[0].message });
  }

  // Prove the token against the operator's PocketBase. Any PB fault (expired
  // token, revoked session, network) reduces to a single 400 so we never leak
  // internals or the internal PB URL.
  let identity: PbAuthRecordIdentity;
  try {
    identity = await confirmCollectionAuth(cfg, cfg.authCollection, parsed.data.token);
  } catch {
    return res.status(400).json({
      success: false,
      error: "Your PocketBase session is invalid or has expired. Please sign in again.",
    });
  }

  const env = getEnv();
  const invite = parsed.data.invite?.trim() || null;

  // (1) Already linked identity → refresh stored refs and sign in.
  const account = await prisma.oAuthAccount.findUnique({
    where: { provider_providerAccountId: { provider: PB_PROVIDER, providerAccountId: identity.id } },
    include: { user: true },
  });
  if (account) {
    await prisma.oAuthAccount
      .update({
        where: { id: account.id },
        data: {
          email: identity.email,
          emailVerified: identity.emailVerified,
          displayName: identity.name,
          avatarUrl: identity.avatarUrl,
        },
      })
      .catch(() => {});
    if (!(await ssoForceBlocksLogin(res, account.user.id))) return;
    const bypass = env.SSO_2FA_BYPASS_ALLOWED && account.user.oauthBypass2fa;
    return issueLoginResponse(res, account.user, bypass);
  }

  // (2) PB-verified email matching an existing account → auto-link.
  // This intentionally DIVERGES from social SSO (A2 → 409 "log in and link"):
  // PocketBase is operator-controlled, so a PB-verified address is a first-party
  // identity in the same trust domain as Enterprise SSO — the caller proving the
  // mailbox through PB is good enough to attach the identity and sign in.
  if (identity.email && identity.emailVerified) {
    const existingUser = await prisma.user.findUnique({ where: { email: identity.email.toLowerCase() } });
    if (existingUser) {
      if (await isAccountSsoForced(existingUser.id)) {
        return res.status(403).json({
          success: false,
          error: "This account requires sign-in via enterprise SSO",
        });
      }
      if (!existingUser.emailVerified) {
        // A3b mirror — the platform account never verified its email: control
        // of the matched address through the verified PB identity IS the
        // verification (double-opt-in), not a silent takeover.
        await prisma.$transaction(async (tx) => {
          await tx.oAuthAccount.upsert({
            where: { provider_providerAccountId: { provider: PB_PROVIDER, providerAccountId: identity.id } },
            create: {
              userId: existingUser.id,
              provider: PB_PROVIDER,
              providerAccountId: identity.id,
              email: identity.email,
              emailVerified: true,
              displayName: identity.name,
              avatarUrl: identity.avatarUrl,
            },
            update: {
              userId: existingUser.id,
              email: identity.email,
              emailVerified: true,
              displayName: identity.name,
              avatarUrl: identity.avatarUrl,
            },
          });
          await tx.user.update({
            where: { id: existingUser.id },
            data: { emailVerified: true, emailVerifiedAt: new Date() },
          });
        });
        if (!(await ssoForceBlocksLogin(res, existingUser.id))) return;
        const bypass = env.SSO_2FA_BYPASS_ALLOWED && existingUser.oauthBypass2fa;
        return issueLoginResponse(res, existingUser, bypass);
      }
      // Verified account: attach the PB identity and sign in.
      await prisma.oAuthAccount.upsert({
        where: { provider_providerAccountId: { provider: PB_PROVIDER, providerAccountId: identity.id } },
        create: {
          userId: existingUser.id,
          provider: PB_PROVIDER,
          providerAccountId: identity.id,
          email: identity.email,
          emailVerified: true,
          displayName: identity.name,
          avatarUrl: identity.avatarUrl,
        },
        update: {
          userId: existingUser.id,
          email: identity.email,
          emailVerified: true,
          displayName: identity.name,
          avatarUrl: identity.avatarUrl,
        },
      });
      if (!(await ssoForceBlocksLogin(res, existingUser.id))) return;
      const bypass = env.SSO_2FA_BYPASS_ALLOWED && existingUser.oauthBypass2fa;
      return issueLoginResponse(res, existingUser, bypass);
    }
  }

  // (3) New user. Unverified PB emails can't provision directly (A3a): the
  // completion flow stores them as UNVERIFIED and mails a confirmation link.
  // Verified emails provision instantly when the instance isn't invite-gated or
  // a valid invite travelled with the PB token; otherwise they continue through
  // the existing needs_setup completion flow (which collects username + invite).
  const requiresInvite = env.SSO_SIGNUP_REQUIRES_INVITE && !invite;
  if (!identity.email || !identity.emailVerified || requiresInvite) {
    return res.json({
      success: true,
      data: {
        status: "needs_setup",
        signupToken: oauthJwt<OAuthSignupPayload>(
          {
            purpose: "oauth_signup",
            provider: PB_PROVIDER,
            id: identity.id,
            email: identity.email,
            emailVerified: identity.emailVerified,
            name: identity.name,
            avatar: identity.avatarUrl,
            invite: invite ?? undefined,
          },
          SIGNUP_TTL_SECONDS
        ),
        provider: PB_PROVIDER,
        name: identity.name,
        avatar: identity.avatarUrl,
        email: identity.email,
        requiresEmail: !identity.email,
        requiresInvite,
        suggestedUsername: makeUsernameSeed(identity.email, identity.name),
      },
    });
  }

  // (4) Verified identity + invite gate satisfied → provision immediately.
  const userRole = await prisma.role.findUnique({ where: { slug: "user" }, select: { id: true } });
  if (!userRole) {
    return res.status(500).json({ success: false, error: "Default role not configured" });
  }

  try {
    const created = await prisma.$transaction((tx) =>
      provisionOAuthIdentity(tx, {
        provider: PB_PROVIDER,
        id: identity.id,
        email: identity.email!,
        emailVerified: true,
        name: identity.name,
        avatarUrl: identity.avatarUrl,
        invite,
        fingerprint: req.authFingerprint ?? null,
        userRoleId: userRole.id,
      })
    );
    dispatchWebhookEvent(created.id, "user.registered", {
      userId: created.id,
      username: created.username,
      registeredAt: new Date().toISOString(),
    });
    const token = await signToken(created.id, env.JWT_EXPIRES_IN);
    return res.status(201).json({
      success: true,
      data: { status: "logged_in", token, user: await userPublic(created) },
    });
  } catch (err) {
    if (err instanceof InviteError) {
      return res.status(err.status === 409 ? 409 : 400).json({ success: false, error: err.message });
    }
    throw err;
  }
});

/**
 * Explicit, authenticated "link this PB identity to my account" (the security
 * valve behind Security-tab "Link PocketBase"). Only a PB-verified email may
 * be linked — an unverified address could otherwise attach an identity the PB
 * user doesn't own to a platform account.
 */
router.post("/pocketbase/link", requireAuth, authRateLimit, async (req, res) => {
  const cfg = getPocketbaseConfig();
  if (!cfg.enabled || !cfg.oauthEnabled) {
    return res.status(404).json({ success: false, error: "PocketBase sign-in is not enabled on this instance" });
  }
  const parsed = pocketbaseTokenSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: parsed.error.issues[0].message });
  }

  let identity: PbAuthRecordIdentity;
  try {
    identity = await confirmCollectionAuth(cfg, cfg.authCollection, parsed.data.token);
  } catch {
    return res.status(400).json({
      success: false,
      error: "Your PocketBase session is invalid or has expired. Please sign in again.",
    });
  }
  if (!identity.emailVerified) {
    return res.status(400).json({
      success: false,
      error: "Verify your email on PocketBase before linking this identity.",
    });
  }

  const account = await prisma.oAuthAccount.findUnique({
    where: { provider_providerAccountId: { provider: PB_PROVIDER, providerAccountId: identity.id } },
  });
  if (account) {
    if (account.userId === req.userId) {
      return res.json({ success: true, data: { linked: true, alreadyLinked: true } });
    }
    return res.status(409).json({
      success: false,
      error: "This PocketBase identity is already linked to another account.",
    });
  }

  try {
    await prisma.oAuthAccount.create({
      data: {
        userId: req.userId as string,
        provider: PB_PROVIDER,
        providerAccountId: identity.id,
        email: identity.email,
        emailVerified: identity.emailVerified,
        displayName: identity.name,
        avatarUrl: identity.avatarUrl,
      },
    });
  } catch (err) {
    // Unique (provider, providerAccountId): a concurrent request may have won.
    if ((err as { code?: string }).code === "P2002") {
      return res.status(409).json({
        success: false,
        error: "This PocketBase identity is already linked to another account.",
      });
    }
    throw err;
  }

  res.json({ success: true, data: { linked: true, alreadyLinked: false } });
});

export default router;