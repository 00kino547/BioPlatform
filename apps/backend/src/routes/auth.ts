import { Router, type Response } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { getEnv } from "../config/env.js";
import { requireAuth } from "../middleware/auth.js";
import { permissionsFor, effectiveApiLevel } from "../lib/permissions.js";
import { generateTotpSecret, verifyTotpCode } from "../lib/totp.js";
import {
  cleanupExpiredChallenges,
  generateLoginOptions,
  generateRegisterOptions,
  verifyLogin,
  verifyRegister,
} from "../lib/webauthn.js";
import { authRateLimit } from "../middleware/rateLimit.js";
import { isEmailEnabled, sendEmail, buildUnlockEmail } from "../lib/email.js";
import { dispatchWebhookEvent } from "../lib/webhook.js";

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
    .regex(/^[a-z0-9_-]+$/, "Username can only contain lowercase letters, numbers, underscores, and hyphens"),
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
});

const identifierSchema = z.object({
  identifier: z.string().min(1).max(128),
});

const loginSchema = z.object({
  identifier: z.string().min(1).max(128),
  password: z.string().min(1),
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

interface TwoFactorPayload {
  userId: string;
  purpose: "twofactor";
}

interface AuthPayload {
  userId: string;
  purpose: "auth";
}

function signToken(userId: string, expiresIn: string) {
  const payload: AuthPayload = { userId, purpose: "auth" };
  return jwt.sign(payload, getEnv().JWT_SECRET, { expiresIn: expiresIn as jwt.SignOptions["expiresIn"] });
}

function signTwoFactorToken(userId: string) {
  return jwt.sign({ userId, purpose: "twofactor" }, getEnv().JWT_SECRET, { expiresIn: "5m" });
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

async function userPublic(user: {
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
    isAdmin: permissions.length > 0,
    tier: user.tier,
    apiLevel: effectiveApiLevel(role, user.tier),
    trackLimit: user.trackLimit,
    profileLimit: user.profileLimit,
    aliasLimit: user.aliasLimit,
    badges: (user.badges ?? []).map((b) => b.id),
    totpEnabled: user.totpEnabled,
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

  const { username, email, password, inviteCode } = parsed.data;
  const normalizedEmail = email.toLowerCase();

  const code = await prisma.inviteCode.findUnique({
    where: { code: inviteCode },
  });

  if (!code) {
    return invalidInvite(res, "Invite code is invalid");
  }

  if (code.usedById) {
    return invalidInvite(res, "Invite code has already been used");
  }

  if (code.revokedAt) {
    return invalidInvite(res, "Invite code has been revoked");
  }

  if (code.expiresAt && code.expiresAt < new Date()) {
    return invalidInvite(res, "Invite code has expired");
  }

  const existingUsers = await prisma.user.findMany({
    where: { OR: [{ email: normalizedEmail }, { username }] },
    select: { email: true, username: true },
  });

  if (existingUsers.length > 0) {
    const fieldErrors: Record<string, string> = {};
    if (existingUsers.some((user) => user.username === username)) {
      fieldErrors.username = "Username is already taken";
    }
    if (existingUsers.some((user) => user.email === normalizedEmail)) {
      fieldErrors.email = "Email is already registered";
    }
    return res.status(409).json({
      success: false,
      error: "Please choose a different username or email.",
      fieldErrors,
    });
  }

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
      const u = await tx.user.create({
        data: {
          username,
          email: normalizedEmail,
          passwordHash,
          roleId: userRole.id,
          registeredIp: req.authFingerprint?.ip ?? null,
        },
      });

      await tx.profile.create({
        data: { userId: u.id, slug: username, isPrimary: true },
      });

      const consumed = await tx.inviteCode.updateMany({
        where: { id: code.id, usedById: null, revokedAt: null },
        data: { usedById: u.id, usedAt: new Date() },
      });
      if (consumed.count !== 1) {
        throw new Error("INVITE_ALREADY_USED");
      }

      return u;
    });

    const env = getEnv();
    const token = signToken(user.id, env.JWT_EXPIRES_IN);

    dispatchWebhookEvent(user.id, "user.registered", {
      userId: user.id,
      username: user.username,
      registeredAt: new Date().toISOString(),
    });

    res.status(201).json({
      success: true,
      data: { token, user: await userPublic(user) },
    });
  } catch (err) {
    if (err instanceof Error && err.message === "INVITE_ALREADY_USED") {
      return invalidInvite(res, "Invite code has already been used");
    }
    if (err instanceof Error && "code" in err && err.code === "P2002") {
      return res.status(409).json({
        success: false,
        error: "Username or email is already taken.",
        fieldErrors: { username: "Username or email is already taken", email: "Username or email is already taken" },
      });
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

  const passkeyCount = await prisma.passkey.count({ where: { userId: user.id } });

  res.json({
    success: true,
    data: {
      found: true,
      methods: {
        password: true,
        passkey: passkeyCount > 0,
        totp: user.totpEnabled,
      },
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

  const { identifier, password } = parsed.data;

  const user = await findUserByIdentifier(identifier);
  if (!user) {
    return res.status(401).json({ success: false, error: "Invalid credentials" });
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return res.status(401).json({ success: false, error: "Invalid credentials" });
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
  const token = signToken(user.id, env.JWT_EXPIRES_IN);

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

  const env = getEnv();
  const token = signToken(user.id, env.JWT_EXPIRES_IN);

  res.json({
    success: true,
    data: { token, user: await userPublic(user) },
  });
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
  const token = signToken(user.id, env.JWT_EXPIRES_IN);

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
    userVerification: "discouraged",
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
  const token = signToken(userId, env.JWT_EXPIRES_IN);

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    return res.status(401).json({ success: false, error: "Invalid credentials" });
  }

  res.json({ success: true, data: { token, user: await userPublic(user) } });
});

router.post("/passkeys/options", requireAuth, async (req, res) => {
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

router.post("/passkeys/register", requireAuth, async (req, res) => {
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
      createdAt: p.createdAt,
      lastUsedAt: p.lastUsedAt,
    })),
  });
});

router.delete("/passkeys/:id", requireAuth, async (req, res) => {
  const passkey = await prisma.passkey.findFirst({
    where: { id: req.params.id as string, userId: req.userId! },
  });

  if (!passkey) {
    return res.status(404).json({ success: false, error: "Passkey not found" });
  }

  await prisma.passkey.delete({ where: { id: passkey.id } });
  res.json({ success: true });
});

router.post("/totp/setup", requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId! } });
  if (!user) {
    return res.status(404).json({ success: false, error: "User not found" });
  }

  const { secret, otpauthUrl } = generateTotpSecret(user.username, getEnv().WEBAUTHN_RP_NAME);

  await prisma.user.update({
    where: { id: user.id },
    data: { totpSecret: secret },
  });

  res.json({ success: true, data: { secret, otpauthUrl } });
});

router.post("/totp/enable", requireAuth, async (req, res) => {
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

router.post("/totp/disable", requireAuth, async (req, res) => {
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

  res.json({
    success: true,
    data: {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      permissions,
      isAdmin: permissions.length > 0,
      tier: user.tier,
      apiLevel: effectiveApiLevel(user.role, user.tier),
      trackLimit: user.trackLimit,
      profileLimit: user.profileLimit,
      aliasLimit: user.aliasLimit,
      badges: user.badges.map((b) => b.id),
      totpEnabled: user.totpEnabled,
    },
  });
});

router.post("/change-password", requireAuth, async (req, res) => {
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
}, 30 * 60 * 1000);

export default router;
