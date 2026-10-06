import { Router, type Request, type Response } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { getEnv } from "../config/env.js";
import { requireAuth } from "../middleware/auth.js";
import { readConsentState } from "../middleware/consent.js";
import { permissionsFor, effectiveApiLevel, isAdminRole } from "../lib/permissions.js";
import { generateTotpSecret, sealTotpSecret, verifyTotpCode } from "../lib/totp.js";
import {
  cleanupExpiredChallenges,
  generateLoginOptions,
  generateRegisterOptions,
  generateDiscoverableLoginOptions,
  verifyLogin,
  verifyRegister,
  verifyDiscoverableLogin,
} from "../lib/webauthn.js";
import { authRateLimit } from "../middleware/rateLimit.js";
import { isReservedSlug } from "../lib/reservedSlugs.js";
import { POLICY_VERSIONS } from "../lib/newsletter.js";
import { isEmailEnabled, sendEmail, buildUnlockEmail, buildVerifyEmail } from "../lib/email.js";
import { dispatchWebhookEvent } from "../lib/webhook.js";
import { requireNoUpdateLockdown } from "../lib/versionCheck.js";
import { isAccountSsoForced, ssoForceBlocksLogin } from "../lib/ssoEnforcement.js";
import { verifyCaptcha } from "../lib/captcha.js";
import { bumpAuthVersion } from "../lib/authVersion.js";
import {
  applyInviteeDiscount,
  ensureReferralEdge,
  detectInviteAbuse,
  fingerprintHashes,
  type AbuseAction,
} from "../lib/affiliateService.js";
import { adoptGuestPurchase, guestPurchaseOrderId } from "../lib/inviteOrders.js";
import type { InviteDb } from "../lib/inviteService.js";

const router = Router();

function requestHost(req: { headers: { host?: string | string[] } }): string | undefined {
  const host = req.headers.host;
  return typeof host === "string" ? host.split(",")[0].trim() : undefined;
}

router.use(authRateLimit);

const registerSchema = z.object({
  username: z
    .string({ required_error: "Username is required", invalid_type_error: "Username must be text" })
    .min(3, "Username must be at least 3 characters")
    .max(32, "Username must be 32 characters or fewer")
    .regex(/^[a-z0-9_-]+$/, "Username can only contain lowercase letters, numbers, underscores, and hyphens")
    .refine((u) => !isReservedSlug(u), "That username is reserved"),
  email: z
    .string({ required_error: "Email is required", invalid_type_error: "Email must be text" })
    .trim()
    .min(1, "Email is required")
    .max(254, "Email must be 254 characters or fewer")
    .email("Email must be a valid email address"),
  password: z
    .string({ required_error: "Password is required", invalid_type_error: "Password must be text" })
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password must be 128 characters or fewer"),
  inviteCode: z
    .string({ required_error: "Invite code is required", invalid_type_error: "Invite code must be text" })
    .trim()
    .min(1, "Invite code is required")
    .max(128, "Invite code must be 128 characters or fewer"),
  captchaToken: z.string().optional(),
  acceptedPolicies: z.literal(true, {
    errorMap: () => ({ message: "You must accept the Terms of Service and Privacy Policy" }),
  }),
  newsletterOptIn: z.boolean().optional(),
});

const identifierSchema = z.object({
  identifier: z.string().min(1).max(128),
});

const loginSchema = z.object({
  identifier: z.string().min(1).max(128),
  password: z.string().min(1),
  captchaToken: z.string().optional(),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(128),
});

const registrationResponseSchema = z.object({
  id: z.string().min(1),
  rawId: z.string().min(1),
  type: z.literal("public-key"),
  response: z.record(z.string(), z.unknown()),
  clientExtensionResults: z.record(z.string(), z.unknown()).default({}),
  authenticatorAttachment: z.string().optional(),
});

const authenticationResponseSchema = z.object({
  id: z.string().min(1),
  rawId: z.string().min(1),
  type: z.literal("public-key"),
  response: z.record(z.string(), z.unknown()),
  clientExtensionResults: z.record(z.string(), z.unknown()).default({}),
  authenticatorAttachment: z.string().optional(),
});

const totpCodeSchema = z.object({
  code: z.string().min(6).max(6),
});

const twoFactorTokenSchema = z.object({
  token: z.string().min(1),
});

function registerFieldErrors(error: z.ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = issue.path[0];
    if (typeof field === "string" && !fieldErrors[field]) {
      fieldErrors[field] = issue.message;
    }
  }
  return fieldErrors;
}

function invalidInvite(res: Response, error: string) {
  res.locals.countAuthFailure = true;
  res.locals.authFailureReason = error;
  return res.status(400).json({
    success: false,
    error,
    fieldErrors: { inviteCode: error },
  });
}

class InviteError extends Error {
  constructor(message: string, public status: number = 400) {
    super(message);
  }
}

async function enforceCaptcha(req: Request, res: Response, token: unknown): Promise<boolean> {
  const result = await verifyCaptcha(
    typeof token === "string" ? token : undefined,
    req.authFingerprint?.ip ?? (req.ip as string | undefined)
  );
  if (result.success) return true;
  res.status(400).json({ success: false, error: result.error ?? "Captcha verification failed" });
  return false;
}

interface TwoFactorPayload {
  userId: string;
  purpose: "twofactor";
}

interface AuthPayload {
  userId: string;
  purpose: "auth";
  /** authVersion at issue time — validated against the user's current value by requireAuth (A4). */
  av?: number;
}

/**
 * Signs an authentication JWT. Async because it embeds the user's current
 * `authVersion`, which is required so that a password change / admin reset
 * (both of which bump the counter) invalidates every previously issued token.
 * A missing user row signs without `av`; requireAuth treats an absent claim
 * as version 0, so those tokens are only ever accepted for users still at 0.
 */
export async function signToken(userId: string, expiresIn: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { authVersion: true },
  });
  const payload: AuthPayload = {
    userId,
    purpose: "auth",
    ...(user ? { av: user.authVersion } : {}),
  };
  return jwt.sign(payload, getEnv().JWT_SECRET, { expiresIn: expiresIn as jwt.SignOptions["expiresIn"] });
}

export function signTwoFactorToken(userId: string) {
  return jwt.sign({ userId, purpose: "twofactor" }, getEnv().JWT_SECRET, { expiresIn: "5m" });
}

/**
 * A5 — completes a PRIMARY passkey login. A passkey proves possession of the
 * device only, so if the account has TOTP enabled it must satisfy the SECOND
 * factor as well; issuing a full session token here would silently bypass 2FA.
 * When the account requires TOTP, `requiresTwoFactor: true` is returned with a
 * `twoFactorToken` that the client must complete via /2fa/totp (or the
 * passkey second-factor flow). Passkey-only accounts (no TOTP configured) are
 * unaffected and go straight to `logged_in`.
 */
async function finishPasskeyLogin(
  res: Response,
  user: Parameters<typeof userPublic>[0] & { emailVerified: boolean }
) {
  // A3b — an unverified account cannot complete a primary login through any
  // path (passkeys cannot be registered before the first verified sign-in, so
  // this never triggers for real accounts; it closes the theoretical path).
  if (user.email && !user.emailVerified) {
    return res.status(403).json({
      success: false,
      error: "Please verify your email before signing in. Check your inbox for the verification link.",
      verifyEmailRequired: true,
    });
  }
  if (user.totpEnabled) {
    const passkeyCount = await prisma.passkey.count({ where: { userId: user.id } });
    return res.json({
      success: true,
      data: {
        requiresTwoFactor: true,
        methods: { totp: true, passkey: passkeyCount > 0 },
        twoFactorToken: signTwoFactorToken(user.id),
      },
    });
  }
  const token = await signToken(user.id, getEnv().JWT_EXPIRES_IN);
  return res.json({
    success: true,
    data: { token, user: await userPublic(user) },
  });
}

function verifyTwoFactorToken(token: string): string | null {
  try {
    const payload = jwt.verify(token, getEnv().JWT_SECRET) as TwoFactorPayload;
    if (payload.purpose !== "twofactor") return null;
    return payload.userId;
  } catch {
    return null;
  }
}

export async function userPublic(user: {
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
  newsletterSenderWhitelisted?: boolean;
  newsletterOptIn?: boolean;
}) {
  const role = await prisma.role.findUnique({
    where: { id: user.roleId },
    select: { id: true, slug: true, name: true, isSystem: true, permissions: true },
  });
  const permissions = permissionsFor(role);
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    role: role ?? null,
    permissions,
    isAdmin: isAdminRole(role),
    tier: user.tier,
    apiLevel: effectiveApiLevel(role, user.tier),
    trackLimit: user.trackLimit,
    profileLimit: user.profileLimit,
    aliasLimit: user.aliasLimit,
    badges: (user.badges ?? []).map((b) => b.id),
    totpEnabled: user.totpEnabled,
    newsletterSenderWhitelisted: user.newsletterSenderWhitelisted ?? false,
    newsletterOptIn: user.newsletterOptIn ?? false,
  };
}

async function findUserByIdentifier(identifier: string) {
  const lower = identifier.toLowerCase();
  return prisma.user.findFirst({
    where: { OR: [{ email: lower }, { username: lower }] },
  });
}

router.post("/register", async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: "Please fix the highlighted fields.",
      fieldErrors: registerFieldErrors(parsed.error),
    });
  }

  if (!(await enforceCaptcha(req, res, parsed.data.captchaToken))) return;

  const { username, email, password, inviteCode, newsletterOptIn } = parsed.data;
  const normalizedEmail = email.toLowerCase();

  const passwordHash = await bcrypt.hash(password, 12);
  const userRole = await prisma.role.findUnique({
    where: { slug: "user" },
    select: { id: true },
  });
  if (!userRole) {
    return res.status(500).json({ success: false, error: "Default role not configured" });
  }

  try {
    const user = await prisma.$transaction(async (tx) => {
      const code = await tx.inviteCode.findUnique({ where: { code: inviteCode } });
      if (!code) throw new InviteError("Invite code is invalid");
      if (code.usedById) throw new InviteError("Invite code has already been used");
      if (code.revokedAt) throw new InviteError("Invite code has been revoked");
      if (code.expiresAt && code.expiresAt < new Date()) throw new InviteError("Invite code has expired");

      const existing = await tx.user.findFirst({
        where: { OR: [{ email: normalizedEmail }, { username }] },
        select: { id: true },
      });
      if (existing) throw new InviteError("Username or email is already taken", 409);

      // The slug lives in one flat namespace shared with profile aliases, so a
      // username that collides with an existing alias must be rejected too.
      const aliasClash = await tx.profileAlias.findUnique({ where: { slug: username }, select: { id: true } });
      if (aliasClash) throw new InviteError("Username or email is already taken", 409);

      const fingerprint = req.authFingerprint
        ? { ip: req.authFingerprint.ip, cookie: req.authFingerprint.cookie, userAgent: req.authFingerprint.userAgent }
        : null;

      let abused: "referral" | "invite" | null = null;
      let abuseAction: AbuseAction = "reject";
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

      const fpHashes = fingerprint ? fingerprintHashes(fingerprint) : null;

      const u = await tx.user.create({
        data: {
          username,
          email: normalizedEmail,
          passwordHash,
          roleId: userRole.id,
          registeredIp: fpHashes?.ip ?? null,
          registeredFingerprint: fpHashes?.cookie ?? null,
          registeredUserAgentHash: fpHashes?.userAgentHash ?? null,
          acceptedTosVersion: POLICY_VERSIONS.tos,
          acceptedPrivacyVersion: POLICY_VERSIONS.privacy,
          acceptedPoliciesAt: new Date(),
          newsletterOptIn: newsletterOptIn === true,
          newsletterOptInAt: newsletterOptIn === true ? new Date() : null,
        },
      });

      const primary = await tx.profile.create({
        data: { userId: u.id, slug: username, isPrimary: true },
      });
      // Reserve the slug in the shared namespace so it can never collide with a
      // profile alias or another slug. Rolls back with the whole transaction on
      // a unique-violation race.
      await tx.slugNamespace.create({
        data: { slug: username, kind: "profile", profileId: primary.id },
      });

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

      // A guest purchase is delivered as real codes, because a buyer with no account
      // has no balance to hold credits on. Redeeming one of them is what proves the
      // holder is the buyer, so the remaining codes of that purchase come with them.
      const purchasedOrderId = guestPurchaseOrderId(code.note);
      if (purchasedOrderId) {
        await adoptGuestPurchase(u.id, purchasedOrderId, tx as unknown as InviteDb);
      }

      return { user: u, abused, abuseAction };
    });

    const env = getEnv();
    // A3b — new local accounts start in the unverified state: the invite is
    // consumed and the profile is created, but the account cannot sign in
    // until the email is confirmed via a signed link. The email send is
    // best-effort — if SMTP is off, the sender is re-requested later through
    // /verify-email/send.
    const verifyToken = jwt.sign(
      { userId: user.user.id, email: user.user.email, purpose: "email_verify" },
      env.JWT_SECRET,
      { expiresIn: `${env.EMAIL_VERIFY_TOKEN_TTL_HOURS}h` as jwt.SignOptions["expiresIn"] }
    );
    const verifyUrl = `${env.CORS_ORIGIN}/verify-email?token=${encodeURIComponent(verifyToken)}`;

    const emailResult = await sendEmail({
      to: user.user.email,
      subject: `Confirm your ${env.SMTP_FROM_NAME} account`,
      html: buildVerifyEmail({
        appName: env.SMTP_FROM_NAME,
        username: user.user.username,
        verifyUrl,
      }),
    });

    dispatchWebhookEvent(user.user.id, "user.registered", {
      userId: user.user.id,
      username: user.user.username,
      registeredAt: new Date().toISOString(),
    });

    const response: {
      success: true;
      data: { status: "verification_required"; emailSent: boolean; warning?: string };
    } = {
      success: true,
      data: { status: "verification_required", emailSent: emailResult.success },
    };
    if (user.abused && user.abuseAction === "warn") {
      response.data.warning = user.abused === "referral"
        ? "Referral skipped: this device/network has already used an invite from this creator."
        : "Invite registered without referral: this device/network has already used an invite.";
    }
    res.status(201).json(response);
  } catch (err) {
    if (err instanceof InviteError) {
      if (err.status === 409) {
        return res.status(409).json({
          success: false,
          error: err.message,
        });
      }
      return invalidInvite(res, err.message);
    }
    throw err;
  }
});

router.post("/login/start", async (req, res) => {
  const parsed = identifierSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: parsed.error.issues[0].message });
  }

  const user = await findUserByIdentifier(parsed.data.identifier);
  if (!user) {
    return res.json({
      success: true,
      data: { found: true, methods: { password: true, passkey: false, totp: false } },
    });
  }

  const methods = { password: true, passkey: false, totp: false };

  res.json({
    success: true,
    data: {
      found: true,
      methods,
    },
  });
});

router.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: parsed.error.issues[0].message,
    });
  }

  if (!(await enforceCaptcha(req, res, parsed.data.captchaToken))) return;

  const { identifier, password } = parsed.data;

  const user = await findUserByIdentifier(identifier);
  if (!user) {
    return res.status(401).json({ success: false, error: "Invalid credentials" });
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return res.status(401).json({ success: false, error: "Invalid credentials" });
  }

  if (await isAccountSsoForced(user.id)) {
    return res.status(403).json({ success: false, error: "This account requires sign-in via enterprise SSO" });
  }

  // A3b — a password is correct but the email was never confirmed; the account
  // cannot sign in until the email is verified (a verified provider/SSO email
  // also satisfies this via the OAuth/SSO exchange or the /verify-email link).
  // Not counted as a failed login.
  if (user.email && !user.emailVerified) {
    return res.status(403).json({
      success: false,
      error: "Please verify your email before signing in. Check your inbox for the verification link.",
      verifyEmailRequired: true,
    });
  }

  const passkeyCount = await prisma.passkey.count({ where: { userId: user.id } });
  const requiresTwoFactor = user.totpEnabled || passkeyCount > 0;

  if (requiresTwoFactor) {
    return res.json({
      success: true,
      data: {
        requiresTwoFactor: true,
        methods: {
          totp: user.totpEnabled,
          passkey: passkeyCount > 0,
        },
        twoFactorToken: signTwoFactorToken(user.id),
      },
    });
  }

  const env = getEnv();
  const token = await signToken(user.id, env.JWT_EXPIRES_IN);

  res.json({
    success: true,
    data: { token, user: await userPublic(user) },
  });
});

router.post("/login/passkey/options", async (req, res) => {
  const parsed = identifierSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: parsed.error.issues[0].message });
  }

  const user = await findUserByIdentifier(parsed.data.identifier);
  if (!user) {
    return res.status(401).json({ success: false, error: "Invalid credentials" });
  }

  const passkeys = await prisma.passkey.findMany({ where: { userId: user.id } });
  if (passkeys.length === 0) {
    return res.status(401).json({ success: false, error: "Invalid credentials" });
  }

  const options = await generateLoginOptions({
    userId: user.id,
    allowCredentials: passkeys.map((p) => ({ id: p.credentialId, transports: p.transports })),
    userVerification: "preferred",
    host: requestHost(req),
  });

  res.json({ success: true, data: { options, identifier: parsed.data.identifier } });
});

router.post("/login/passkey/verify", async (req, res) => {
  const parsed = z
    .object({
      identifier: z.string().min(1),
      response: authenticationResponseSchema,
    })
    .safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: parsed.error.issues[0].message });
  }

  const user = await findUserByIdentifier(parsed.data.identifier);
  if (!user) {
    return res.status(401).json({ success: false, error: "Invalid credentials" });
  }

  const result = await verifyLogin(
    user.id,
    parsed.data.response as never,
    "login",
    async (credentialId) =>
      prisma.passkey.findFirst({ where: { userId: user.id, credentialId } }),
    requestHost(req)
  );

  if (!result.verified) {
    return res.status(401).json({ success: false, error: "Passkey authentication failed" });
  }

  if (!(await ssoForceBlocksLogin(res, user.id))) return;

  return finishPasskeyLogin(res, user);
});

router.post("/login/passkey/discoverable/options", async (_req, res) => {
  const options = await generateDiscoverableLoginOptions({
    userVerification: "preferred",
    host: requestHost(_req),
  });
  res.json({ success: true, data: { options } });
});

router.post("/login/passkey/discoverable/verify", async (req, res) => {
  const parsed = z.object({ response: authenticationResponseSchema }).safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: parsed.error.issues[0].message });
  }

  const result = await verifyDiscoverableLogin({
    response: parsed.data.response as never,
    getPasskey: async (credentialId) =>
      prisma.passkey.findFirst({
        where: { credentialId },
        select: { id: true, userId: true, credentialId: true, publicKey: true, counter: true, transports: true },
      }),
    host: requestHost(req),
  });

  if (!result.verified || !result.userId) {
    return res.status(401).json({ success: false, error: "Passkey authentication failed" });
  }

  const user = await prisma.user.findUnique({ where: { id: result.userId } });
  if (!user) {
    return res.status(401).json({ success: false, error: "Passkey authentication failed" });
  }

  if (!(await ssoForceBlocksLogin(res, user.id))) return;

  return finishPasskeyLogin(res, user);
});

router.post("/2fa/totp", async (req, res) => {
  const parsed = z.object({ token: z.string().min(1), code: z.string().min(6).max(6) }).safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: parsed.error.issues[0].message });
  }

  const userId = verifyTwoFactorToken(parsed.data.token);
  if (!userId) {
    return res.status(401).json({ success: false, error: "Invalid or expired session" });
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.totpEnabled || !user.totpSecret) {
    return res.status(401).json({ success: false, error: "Invalid credentials" });
  }

  if (!(await verifyTotpCode(user.totpSecret, parsed.data.code))) {
    return res.status(401).json({ success: false, error: "Invalid verification code" });
  }

  const env = getEnv();
  const token = await signToken(user.id, env.JWT_EXPIRES_IN);

  res.json({ success: true, data: { token, user: await userPublic(user) } });
});

router.post("/2fa/passkey/options", async (req, res) => {
  const parsed = twoFactorTokenSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: parsed.error.issues[0].message });
  }

  const userId = verifyTwoFactorToken(parsed.data.token);
  if (!userId) {
    return res.status(401).json({ success: false, error: "Invalid or expired session" });
  }

  const passkeys = await prisma.passkey.findMany({ where: { userId } });
  if (passkeys.length === 0) {
    return res.status(404).json({ success: false, error: "No passkeys registered" });
  }

  const options = await generateLoginOptions({
    userId,
    allowCredentials: passkeys.map((p) => ({ id: p.credentialId, transports: p.transports })),
    userVerification: "required",
    purpose: "twofactor",
    host: requestHost(req),
  });

  res.json({ success: true, data: { options } });
});

router.post("/2fa/passkey/verify", async (req, res) => {
  const parsed = z
    .object({ token: z.string().min(1), response: authenticationResponseSchema })
    .safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: parsed.error.issues[0].message });
  }

  const userId = verifyTwoFactorToken(parsed.data.token);
  if (!userId) {
    return res.status(401).json({ success: false, error: "Invalid or expired session" });
  }

  const result = await verifyLogin(
    userId,
    parsed.data.response as never,
    "twofactor",
    async (credentialId) =>
      prisma.passkey.findFirst({ where: { userId, credentialId } }),
    requestHost(req)
  );

  if (!result.verified) {
    return res.status(401).json({ success: false, error: "Passkey authentication failed" });
  }

  const env = getEnv();
  const token = await signToken(userId, env.JWT_EXPIRES_IN);

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    return res.status(401).json({ success: false, error: "Invalid credentials" });
  }

  res.json({ success: true, data: { token, user: await userPublic(user) } });
});

router.post("/passkeys/options", requireAuth, requireNoUpdateLockdown, async (req, res) => {
  const parsed = z
    .object({ residentKey: z.enum(["resident", "nonResident"]).default("nonResident") })
    .safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: parsed.error.issues[0].message });
  }

  const user = await prisma.user.findUnique({ where: { id: req.userId! } });
  if (!user) {
    return res.status(404).json({ success: false, error: "User not found" });
  }

  const existing = await prisma.passkey.findMany({ where: { userId: user.id } });

  const options = await generateRegisterOptions({
    userId: user.id,
    username: user.username,
    displayName: user.username,
    residentKey: parsed.data.residentKey,
    excludeCredentials: existing.map((p) => p.credentialId),
    host: requestHost(req),
  });

  res.json({ success: true, data: options });
});

router.post("/passkeys/register", requireAuth, requireNoUpdateLockdown, async (req, res) => {
  const parsed = z
    .object({
      response: registrationResponseSchema,
      name: z.string().trim().min(1).max(64).default("Passkey"),
      residentKey: z.enum(["resident", "nonResident"]).default("nonResident"),
    })
    .safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: parsed.error.issues[0].message });
  }

  const result = await verifyRegister(req.userId!, parsed.data.response as never, requestHost(req));
  if (!result.verified) {
    return res.status(401).json({ success: false, error: "Passkey registration failed" });
  }

  const passkey = await prisma.passkey.create({
    data: {
      userId: req.userId!,
      credentialId: result.credential.id,
      publicKey: result.credential.publicKey,
      counter: BigInt(result.credential.counter),
      transports: result.credential.transports,
      name: parsed.data.name,
      residentKey: parsed.data.residentKey === "resident",
      authenticatorAttachment: parsed.data.response.authenticatorAttachment ?? null,
      credentialDeviceType: result.credentialDeviceType ?? null,
    },
  });

  res.json({
    success: true,
    data: {
      passkey: {
        id: passkey.id,
        name: passkey.name,
        credentialId: passkey.credentialId,
        residentKey: passkey.residentKey,
        authenticatorAttachment: passkey.authenticatorAttachment,
        credentialDeviceType: passkey.credentialDeviceType,
        createdAt: passkey.createdAt,
        lastUsedAt: passkey.lastUsedAt,
      },
    },
  });
});

router.get("/passkeys", requireAuth, async (req, res) => {
  const passkeys = await prisma.passkey.findMany({
    where: { userId: req.userId! },
    orderBy: { createdAt: "desc" },
  });

  res.json({
    success: true,
    data: passkeys.map((p) => ({
      id: p.id,
      name: p.name,
      credentialId: p.credentialId,
      residentKey: p.residentKey,
      authenticatorAttachment: p.authenticatorAttachment,
      credentialDeviceType: p.credentialDeviceType,
      createdAt: p.createdAt,
      lastUsedAt: p.lastUsedAt,
    })),
  });
});

router.delete("/passkeys/:id", requireAuth, requireNoUpdateLockdown, async (req, res) => {
  const passkey = await prisma.passkey.findFirst({
    where: { id: req.params.id as string, userId: req.userId! },
  });

  if (!passkey) {
    return res.status(404).json({ success: false, error: "Passkey not found" });
  }

  await prisma.passkey.delete({ where: { id: passkey.id } });
  res.json({ success: true });
});

router.post("/totp/setup", requireAuth, requireNoUpdateLockdown, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId! } });
  if (!user) {
    return res.status(404).json({ success: false, error: "User not found" });
  }

  const { secret, otpauthUrl } = generateTotpSecret(user.username, getEnv().WEBAUTHN_RP_NAME);

  await prisma.user.update({
    where: { id: user.id },
    data: { totpSecret: sealTotpSecret(secret) },
  });

  res.json({ success: true, data: { secret, otpauthUrl } });
});

router.post("/totp/enable", requireAuth, requireNoUpdateLockdown, async (req, res) => {
  const parsed = totpCodeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: parsed.error.issues[0].message });
  }

  const user = await prisma.user.findUnique({ where: { id: req.userId! } });
  if (!user || !user.totpSecret) {
    return res.status(400).json({ success: false, error: "TOTP setup not started" });
  }

  if (!(await verifyTotpCode(user.totpSecret, parsed.data.code))) {
    return res.status(401).json({ success: false, error: "Invalid verification code" });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { totpEnabled: true },
  });

  res.json({ success: true, data: { totpEnabled: true } });
});

router.post("/totp/disable", requireAuth, requireNoUpdateLockdown, async (req, res) => {
  const parsed = totpCodeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: parsed.error.issues[0].message });
  }

  const user = await prisma.user.findUnique({ where: { id: req.userId! } });
  if (!user || !user.totpSecret || !user.totpEnabled) {
    return res.status(400).json({ success: false, error: "TOTP is not enabled" });
  }

  if (!(await verifyTotpCode(user.totpSecret, parsed.data.code))) {
    return res.status(401).json({ success: false, error: "Invalid verification code" });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { totpSecret: null, totpEnabled: false },
  });

  res.json({ success: true, data: { totpEnabled: false } });
});

router.get("/me", requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.userId! },
    include: {
      role: { select: { id: true, slug: true, name: true, isSystem: true, permissions: true } },
      badges: { select: { id: true } },
    },
  });

  if (!user) {
    return res.status(404).json({ success: false, error: "User not found" });
  }

  const permissions = permissionsFor(user.role);

  // One shared read of consent state, which is also where the operator auto-accept
  // is written. Doing it here (rather than inline) means this endpoint can apply it.
  const consent = await readConsentState(user.id);

  res.json({
    success: true,
    data: {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      permissions,
      isAdmin: isAdminRole(user.role),
      tier: user.tier,
      apiLevel: effectiveApiLevel(user.role, user.tier),
      trackLimit: user.trackLimit,
      profileLimit: user.profileLimit,
      aliasLimit: user.aliasLimit,
      badges: user.badges.map((b) => b.id),
      totpEnabled: user.totpEnabled,
      newsletterSenderWhitelisted: user.newsletterSenderWhitelisted ?? false,
      newsletterOptIn: user.newsletterOptIn ?? false,
      // Deemed-acceptance state. Read through the SAME helper the gate uses, so
      // the SPA can never be told "you are current" while the API is refusing the
      // account — the two used to compute this independently.
      //   `current`     — false when the account must still accept the versions
      //   `autoAccepted`— current only because an operator account was recorded
      //                   automatically after the review window (never on the spot)
      consent: {
        current: consent.current,
        behind: consent.behind,
        autoAccepted: consent.autoAccepted,
        versions: POLICY_VERSIONS,
      },
    },
  });
});

/**
 * Records acceptance of the current Terms of Service and Privacy Policy.
 *
 * Deliberately exempt from the consent gate (see middleware/consent.ts) so an
 * out-of-date account can always fix itself. Bumps `acceptedPoliciesAt` as the
 * audit timestamp of the consent moment.
 */
router.post("/accept-policies", requireAuth, async (req, res) => {
  const updated = await prisma.user.update({
    where: { id: req.userId! },
    data: {
      acceptedTosVersion: POLICY_VERSIONS.tos,
      acceptedPrivacyVersion: POLICY_VERSIONS.privacy,
      acceptedPoliciesAt: new Date(),
      // A person clicked this button, so the record must stop claiming the
      // acceptance was automatic. It would otherwise keep reporting "accepted
      // automatically" for an operator who has since accepted deliberately.
      policiesAutoAccepted: false,
    },
    select: {
      acceptedTosVersion: true,
      acceptedPrivacyVersion: true,
      acceptedPoliciesAt: true,
      policiesAutoAccepted: true,
    },
  });

  res.json({
    success: true,
    data: {
      acceptedTosVersion: updated.acceptedTosVersion,
      acceptedPrivacyVersion: updated.acceptedPrivacyVersion,
      acceptedPoliciesAt: updated.acceptedPoliciesAt,
      autoAccepted: updated.policiesAutoAccepted,
      versions: POLICY_VERSIONS,
    },
  });
});

router.post("/change-password", requireAuth, requireNoUpdateLockdown, async (req, res) => {
  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: parsed.error.issues[0].message,
    });
  }

  const { currentPassword, newPassword } = parsed.data;

  const user = await prisma.user.findUnique({ where: { id: req.userId! } });
  if (!user) {
    return res.status(404).json({ success: false, error: "User not found" });
  }

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) {
    return res.status(401).json({ success: false, error: "Current password is incorrect" });
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);

  await prisma.user.update({
    where: { id: req.userId! },
    data: { passwordHash },
  });

  // A4 — invalidate every previously issued session token for this user.
  await bumpAuthVersion(req.userId!);

  dispatchWebhookEvent(req.userId!, "user.updated", {
    userId: req.userId!,
    field: "password",
    updatedAt: new Date().toISOString(),
  });

  res.json({ success: true, message: "Password changed successfully" });
});

const unlockRequestSchema = z.object({
  identifier: z.string().min(1).max(128),
});

const UNLOCK_IP_LIMIT_MAX = 5;
const UNLOCK_IP_WINDOW_MS = 60 * 60 * 1000;
const unlockIpHits = new Map<string, number[]>();

const UNLOCK_ACCOUNT_COOLDOWN_MS = 10 * 60 * 1000;
const lastUnlockSentAt = new Map<string, number>();

function unlockIpRateLimited(ip: string): boolean {
  const now = Date.now();
  const cutoff = now - UNLOCK_IP_WINDOW_MS;
  const hits = (unlockIpHits.get(ip) ?? []).filter((t) => t > cutoff);
  if (hits.length >= UNLOCK_IP_LIMIT_MAX) {
    unlockIpHits.set(ip, hits);
    return true;
  }
  hits.push(now);
  unlockIpHits.set(ip, hits);
  return false;
}

const unlockVerifySchema = z.object({
  token: z.string().min(1),
});

router.post("/unlock", async (req, res) => {
  if (getEnv().AUTH_LOCK_POLICY !== "email") {
    return res.status(400).json({ success: false, error: "Email unlock is not enabled" });
  }

  if (!isEmailEnabled()) {
    return res.status(503).json({ success: false, error: "Email is not configured" });
  }

  const parsed = unlockRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: parsed.error.issues[0].message });
  }

  const ip = req.ip ?? "unknown";
  if (unlockIpRateLimited(ip)) {
    return res.status(429).json({ success: false, error: "Too many unlock requests. Please try again later." });
  }

  const user = await findUserByIdentifier(parsed.data.identifier);
  if (!user) {
    return res.json({ success: true, data: { sent: true } });
  }

  const ban = await prisma.authBan.findUnique({
    where: { kind_value: { kind: "ACCOUNT", value: user.id } },
  });
  if (!ban || !(ban.permanent || (ban.lockedUntil && ban.lockedUntil > new Date()))) {
    return res.json({ success: true, data: { sent: true } });
  }

  const now = Date.now();
  const lastSent = lastUnlockSentAt.get(user.id) ?? 0;
  if (now - lastSent < UNLOCK_ACCOUNT_COOLDOWN_MS) {
    return res.json({ success: true, data: { sent: true } });
  }

  const token = jwt.sign({ userId: user.id, purpose: "unlock" }, getEnv().JWT_SECRET, {
    expiresIn: `${getEnv().AUTH_UNLOCK_TOKEN_TTL_MINUTES}m`,
  });
  const unlockUrl = `${getEnv().CORS_ORIGIN}/unlock?token=${encodeURIComponent(token)}`;

  const result = await sendEmail({
    to: user.email,
    subject: `Unlock your ${getEnv().SMTP_FROM_NAME} account`,
    html: buildUnlockEmail({
      appName: getEnv().SMTP_FROM_NAME,
      username: user.username,
      unlockUrl,
    }),
  });

  if (!result.success) {
    return res.status(500).json({ success: false, error: "Failed to send unlock email" });
  }

  lastUnlockSentAt.set(user.id, now);

  res.json({ success: true, data: { sent: true } });
});

router.post("/unlock/verify", async (req, res) => {
  if (getEnv().AUTH_LOCK_POLICY !== "email") {
    return res.status(400).json({ success: false, error: "Email unlock is not enabled" });
  }

  const parsed = unlockVerifySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: parsed.error.issues[0].message });
  }

  let payload: { userId: string; purpose?: string } | null = null;
  try {
    payload = jwt.verify(parsed.data.token, getEnv().JWT_SECRET) as { userId: string; purpose?: string };
  } catch {
    return res.status(400).json({ success: false, error: "Invalid or expired unlock link" });
  }

  if (payload.purpose !== "unlock") {
    return res.status(400).json({ success: false, error: "Invalid unlock token" });
  }

  const logs = await prisma.authLog.findMany({
    where: { accountId: payload.userId },
    select: { ip: true, fingerprint: true },
  });
  const ips = [...new Set(logs.map((l) => l.ip).filter((v): v is string => Boolean(v)))];
  const cookies = [...new Set(logs.map((l) => l.fingerprint).filter((v): v is string => Boolean(v)))];

  await Promise.all([
    prisma.authBan.deleteMany({ where: { kind: "ACCOUNT", value: payload.userId } }),
    prisma.authBan.deleteMany({ where: { kind: "IP", value: { in: ips } } }),
    prisma.authBan.deleteMany({ where: { kind: "COOKIE", value: { in: cookies } } }),
    prisma.authLog.deleteMany({ where: { accountId: payload.userId } }),
  ]);

  res.json({ success: true });
});

const verifyEmailRequestSchema = z.object({
  identifier: z.string().min(1).max(128),
  captchaToken: z.string().optional(),
});

const verifyEmailSchema = z.object({
  token: z.string().min(1),
});

// Rate limiting for verification-email (re)sends — IP window + per-account
// cooldown, mirroring the unlock flow.
const VERIFY_EMAIL_IP_LIMIT_MAX = 5;
const VERIFY_EMAIL_IP_WINDOW_MS = 60 * 60 * 1000;
const verifyEmailIpHits = new Map<string, number[]>();

const VERIFY_EMAIL_COOLDOWN_MS = 2 * 60 * 1000;
const lastVerifyEmailSentAt = new Map<string, number>();

function verifyEmailIpRateLimited(ip: string): boolean {
  const now = Date.now();
  const cutoff = now - VERIFY_EMAIL_IP_WINDOW_MS;
  const hits = (verifyEmailIpHits.get(ip) ?? []).filter((t) => t > cutoff);
  if (hits.length >= VERIFY_EMAIL_IP_LIMIT_MAX) {
    verifyEmailIpHits.set(ip, hits);
    return true;
  }
  hits.push(now);
  verifyEmailIpHits.set(ip, hits);
  return false;
}

// A3b — confirms the account's email from the signed link, unlocking login.
router.post("/verify-email", async (req, res) => {
  const parsed = verifyEmailSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: parsed.error.issues[0].message });
  }

  let payload: { userId: string; email?: string; purpose?: string } | null = null;
  try {
    payload = jwt.verify(parsed.data.token, getEnv().JWT_SECRET) as {
      userId: string;
      email?: string;
      purpose?: string;
    };
  } catch {
    return res.status(400).json({ success: false, error: "Invalid or expired verification link" });
  }
  if (payload.purpose !== "email_verify") {
    return res.status(400).json({ success: false, error: "Invalid verification link" });
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { id: true, emailVerified: true },
  });
  if (!user) {
    return res.status(400).json({ success: false, error: "Invalid verification link" });
  }
  if (user.emailVerified) {
    return res.json({ success: true, data: { status: "verified", alreadyVerified: true } });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { emailVerified: true, emailVerifiedAt: new Date() },
  });

  res.json({ success: true, data: { status: "verified" } });
});

// A3b — (re)sends the verification email to an unverified account. Returns the
// same success shape for unknown/already-verified identifiers (anti-enumeration).
router.post("/verify-email/send", async (req, res) => {
  if (!isEmailEnabled()) {
    return res.status(503).json({ success: false, error: "Email is not configured" });
  }

  const parsed = verifyEmailRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: parsed.error.issues[0].message });
  }

  const ip = req.ip ?? "unknown";
  if (verifyEmailIpRateLimited(ip)) {
    return res.status(429).json({ success: false, error: "Too many requests. Please try again later." });
  }

  const user = await findUserByIdentifier(parsed.data.identifier);
  if (!user || !user.email || user.emailVerified) {
    return res.json({ success: true, data: { sent: true } });
  }

  const now = Date.now();
  const lastSent = lastVerifyEmailSentAt.get(user.id) ?? 0;
  if (now - lastSent < VERIFY_EMAIL_COOLDOWN_MS) {
    return res.json({ success: true, data: { sent: true } });
  }

  const env = getEnv();
  const token = jwt.sign(
    { userId: user.id, email: user.email, purpose: "email_verify" },
    env.JWT_SECRET,
    { expiresIn: `${env.EMAIL_VERIFY_TOKEN_TTL_HOURS}h` as jwt.SignOptions["expiresIn"] }
  );
  const verifyUrl = `${env.CORS_ORIGIN}/verify-email?token=${encodeURIComponent(token)}`;

  const result = await sendEmail({
    to: user.email,
    subject: `Confirm your ${env.SMTP_FROM_NAME} account`,
    html: buildVerifyEmail({
      appName: env.SMTP_FROM_NAME,
      username: user.username,
      verifyUrl,
    }),
  });

  if (!result.success) {
    return res.status(500).json({ success: false, error: "Failed to send verification email" });
  }

  lastVerifyEmailSentAt.set(user.id, now);

  res.json({ success: true, data: { sent: true } });
});

setInterval(() => {
  void cleanupExpiredChallenges();

  const ipCutoff = Date.now() - UNLOCK_IP_WINDOW_MS;
  for (const [ip, hits] of unlockIpHits) {
    const remaining = hits.filter((t) => t > ipCutoff);
    if (remaining.length === 0) {
      unlockIpHits.delete(ip);
    } else {
      unlockIpHits.set(ip, remaining);
    }
  }

  const sentCutoff = Date.now() - UNLOCK_ACCOUNT_COOLDOWN_MS;
  for (const [accountId, at] of lastUnlockSentAt) {
    if (at < sentCutoff) {
      lastUnlockSentAt.delete(accountId);
    }
  }

  const verifyIpCutoff = Date.now() - VERIFY_EMAIL_IP_WINDOW_MS;
  for (const [ip, hits] of verifyEmailIpHits) {
    const remaining = hits.filter((t) => t > verifyIpCutoff);
    if (remaining.length === 0) {
      verifyEmailIpHits.delete(ip);
    } else {
      verifyEmailIpHits.set(ip, remaining);
    }
  }

  const verifySentCutoff = Date.now() - VERIFY_EMAIL_COOLDOWN_MS;
  for (const [accountId, at] of lastVerifyEmailSentAt) {
    if (at < verifySentCutoff) {
      lastVerifyEmailSentAt.delete(accountId);
    }
  }
}, 30 * 60 * 1000);

export default router;
