import { Router, type Request, type Response, type NextFunction } from "express";
import bcrypt from "bcrypt";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const user = await prisma.user.findUnique({ where: { id: req.userId! } });
  if (!user || user.role !== "ADMIN") {
    return res.status(403).json({ success: false, error: "Admin access required" });
  }
  next();
}

const updateUserSchema = z.object({
  username: z.string().min(3).max(32).regex(/^[a-z0-9_-]+$/).optional(),
  email: z.string().email().optional(),
  role: z.enum(["USER", "ADMIN"]).optional(),
});

const resetPasswordSchema = z.object({
  newPassword: z.string().min(8).max(128),
});

router.use(requireAuth, requireAdmin);

router.get("/users", async (_req, res) => {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      username: true,
      email: true,
      role: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  res.json({ success: true, data: users });
});

router.patch("/users/:id", async (req: Request<{ id: string }>, res) => {
  const parsed = updateUserSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: parsed.error.issues[0].message,
    });
  }

  const { id } = req.params;
  const updates = parsed.data;

  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) {
    return res.status(404).json({ success: false, error: "User not found" });
  }

  if (updates.username && updates.username !== existing.username) {
    const taken = await prisma.user.findUnique({ where: { username: updates.username } });
    if (taken) {
      return res.status(409).json({ success: false, error: "Username already taken" });
    }
  }

  if (updates.email && updates.email !== existing.email) {
    const taken = await prisma.user.findUnique({ where: { email: updates.email } });
    if (taken) {
      return res.status(409).json({ success: false, error: "Email already taken" });
    }
  }

  const user = await prisma.user.update({
    where: { id },
    data: updates,
    select: { id: true, username: true, email: true, role: true, createdAt: true, updatedAt: true },
  });

  res.json({ success: true, data: user });
});

router.post("/users/:id/reset-password", async (req: Request<{ id: string }>, res) => {
  const parsed = resetPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: parsed.error.issues[0].message,
    });
  }

  const { id } = req.params;
  const { newPassword } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) {
    return res.status(404).json({ success: false, error: "User not found" });
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);

  await prisma.user.update({
    where: { id },
    data: { passwordHash },
  });

  res.json({ success: true, message: "Password reset successfully" });
});

const updateProfileSchema = z.object({
  displayName: z.string().max(64).nullable().optional(),
  bio: z.string().max(500).nullable().optional(),
  location: z.string().max(100).nullable().optional(),
  website: z.string().url().max(256).nullable().optional(),
  socialLinks: z
    .array(
      z.object({
        platform: z.string().max(32),
        url: z.string().url().max(256),
      })
    )
    .max(10)
    .nullable()
    .optional(),
  theme: z
    .object({
      bg: z.string().optional(),
      cardBg: z.string().optional(),
      text: z.string().optional(),
      accent: z.string().optional(),
      fontFamily: z.string().optional(),
    })
    .nullable()
    .optional(),
  isPublic: z.boolean().optional(),
});

function toPrismaJson(val: unknown) {
  if (val === null) return Prisma.JsonNull;
  if (val === undefined) return undefined;
  return val as Prisma.InputJsonValue;
}

router.get("/users/:id/profile", async (req: Request<{ id: string }>, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.params.id },
    select: { id: true, username: true, profile: true },
  });

  if (!user) {
    return res.status(404).json({ success: false, error: "User not found" });
  }

  res.json({ success: true, data: { username: user.username, profile: user.profile } });
});

router.put("/users/:id/profile", async (req: Request<{ id: string }>, res) => {
  const parsed = updateProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: parsed.error.issues[0].message,
    });
  }

  const user = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!user) {
    return res.status(404).json({ success: false, error: "User not found" });
  }

  const { socialLinks, theme, ...rest } = parsed.data;

  const profile = await prisma.profile.upsert({
    where: { userId: req.params.id },
    update: {
      ...rest,
      socialLinks: toPrismaJson(socialLinks),
      theme: toPrismaJson(theme),
    },
    create: {
      userId: req.params.id,
      ...rest,
      socialLinks: toPrismaJson(socialLinks),
      theme: toPrismaJson(theme),
    },
  });

  res.json({ success: true, data: profile });
});

export default router;
