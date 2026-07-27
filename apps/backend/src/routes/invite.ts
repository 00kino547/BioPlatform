import { Router, type Request } from "express";
import crypto from "crypto";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

const createSchema = z.object({
  count: z.number().int().min(1).max(50).default(1),
  expiresInDays: z.number().int().min(1).max(365).optional(),
});

router.post("/", requireAuth, async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: parsed.error.issues[0].message,
    });
  }

  const { count, expiresInDays } = parsed.data;

  await prisma.inviteCode.createMany({
    data: Array.from({ length: count }, () => ({
      code: crypto.randomBytes(8).toString("hex"),
      createdById: req.userId!,
      expiresAt: expiresInDays
        ? new Date(Date.now() + expiresInDays * 86400000)
        : null,
    })),
  });

  const created = await prisma.inviteCode.findMany({
    where: { createdById: req.userId! },
    orderBy: { createdAt: "desc" },
    take: count,
  });

  res.status(201).json({
    success: true,
    data: created.map((c) => ({
      code: c.code,
      expiresAt: c.expiresAt,
      createdAt: c.createdAt,
    })),
  });
});

router.get("/", requireAuth, async (req, res) => {
  const codes = await prisma.inviteCode.findMany({
    where: { createdById: req.userId! },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      code: true,
      usedById: true,
      usedAt: true,
      expiresAt: true,
      revokedAt: true,
      createdAt: true,
    },
  });

  res.json({ success: true, data: codes });
});

router.delete("/:id", requireAuth, async (req: Request<{ id: string }>, res) => {
  const code = await prisma.inviteCode.findUnique({
    where: { id: req.params.id },
  });

  if (!code) {
    return res.status(404).json({ success: false, error: "Invite code not found" });
  }

  if (code.createdById !== req.userId!) {
    return res.status(403).json({ success: false, error: "Not your invite code" });
  }

  if (code.usedById) {
    return res.status(400).json({ success: false, error: "Cannot revoke a used invite code" });
  }

  if (code.revokedAt) {
    return res.status(400).json({ success: false, error: "Invite code already revoked" });
  }

  await prisma.inviteCode.update({
    where: { id: req.params.id },
    data: { revokedAt: new Date() },
  });

  res.json({ success: true, message: "Invite code revoked" });
});

export default router;
