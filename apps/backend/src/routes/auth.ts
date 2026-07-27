import { Router } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { getEnv } from "../config/env.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

const registerSchema = z.object({
  username: z.string().min(3).max(32).regex(/^[a-z0-9_-]+$/),
  email: z.string().email(),
  password: z.string().min(8).max(128),
  inviteCode: z.string().min(1),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(128),
});

router.post("/register", async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: parsed.error.issues[0].message,
    });
  }

  const { username, email, password, inviteCode } = parsed.data;

  const code = await prisma.inviteCode.findUnique({
    where: { code: inviteCode },
  });

  if (!code) {
    return res.status(400).json({ success: false, error: "Invalid invite code" });
  }

  if (code.usedById) {
    return res.status(400).json({ success: false, error: "Invite code already used" });
  }

  if (code.revokedAt) {
    return res.status(400).json({ success: false, error: "Invite code has been revoked" });
  }

  if (code.expiresAt && code.expiresAt < new Date()) {
    return res.status(400).json({ success: false, error: "Invite code expired" });
  }

  const existingUser = await prisma.user.findFirst({
    where: { OR: [{ email }, { username }] },
  });

  if (existingUser) {
    const field = existingUser.email === email ? "email" : "username";
    return res.status(409).json({ success: false, error: `Username or ${field} already taken` });
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const user = await prisma.$transaction(async (tx) => {
    const u = await tx.user.create({
      data: { username, email, passwordHash },
    });

    await tx.profile.create({
      data: { userId: u.id },
    });

    await tx.inviteCode.update({
      where: { id: code.id },
      data: { usedById: u.id, usedAt: new Date() },
    });

    return u;
  });

  const env = getEnv();
  const token = jwt.sign({ userId: user.id }, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"],
  });

  res.status(201).json({
    success: true,
    data: {
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
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

  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return res.status(401).json({ success: false, error: "Invalid credentials" });
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return res.status(401).json({ success: false, error: "Invalid credentials" });
  }

  const env = getEnv();
  const token = jwt.sign({ userId: user.id }, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"],
  });

  res.json({
    success: true,
    data: {
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
      },
    },
  });
});

router.get("/me", requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.userId! },
    select: { id: true, username: true, email: true, role: true, createdAt: true },
  });

  if (!user) {
    return res.status(404).json({ success: false, error: "User not found" });
  }

  res.json({ success: true, data: user });
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

  res.json({ success: true, message: "Password changed successfully" });
});

export default router;
