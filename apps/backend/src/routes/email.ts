import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { sendEmail, testEmailConnection, type EmailSettings } from "../lib/email.js";

const router = Router();

const emailSettingsSchema = z.object({
  enabled: z.boolean(),
  provider: z.enum(["gmail", "custom"]),
  gmailUser: z.string().email().optional(),
  gmailAppPassword: z.string().optional(),
  customHost: z.string().optional(),
  customPort: z.number().int().min(1).max(65535).optional(),
  customUser: z.string().optional(),
  customPassword: z.string().optional(),
  customSecure: z.boolean().optional(),
});

router.get("/me", requireAuth, async (req, res) => {
  const profile = await prisma.profile.findUnique({
    where: { userId: req.userId! },
    select: { emailSettings: true },
  });

  res.json({ success: true, data: profile?.emailSettings ?? null });
});

router.put("/me", requireAuth, async (req, res) => {
  const parsed = emailSettingsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: parsed.error.issues[0].message });
  }

  await prisma.profile.upsert({
    where: { userId: req.userId! },
    update: { emailSettings: parsed.data as unknown as Prisma.InputJsonValue },
    create: { userId: req.userId!, emailSettings: parsed.data as unknown as Prisma.InputJsonValue },
  });

  res.json({ success: true, data: parsed.data });
});

router.post("/test", requireAuth, async (req, res) => {
  const profile = await prisma.profile.findUnique({
    where: { userId: req.userId! },
    select: { emailSettings: true },
  });

  const settings = profile?.emailSettings as EmailSettings | null;
  if (!settings?.enabled) {
    return res.status(400).json({ success: false, error: "Email notifications are disabled" });
  }

  const user = await prisma.user.findUnique({
    where: { id: req.userId! },
    select: { email: true },
  });

  if (!user?.email) {
    return res.status(400).json({ success: false, error: "No email address on account" });
  }

  const result = await testEmailConnection(settings);
  if (!result.success) {
    return res.status(400).json({ success: false, error: result.error });
  }

  const sendResult = await sendEmail(settings, {
    to: user.email,
    subject: `Test email from ${process.env.APP_NAME || "BioPlatform"}`,
    html: `<p>This is a test email. If you received this, your email settings are configured correctly.</p>`,
  });

  if (!sendResult.success) {
    return res.status(400).json({ success: false, error: sendResult.error });
  }

  res.json({ success: true });
});

export default router;
