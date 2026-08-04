import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { isEmailEnabled, testConnection, sendEmail, getFromAddress } from "../lib/email.js";
import { getEnv } from "../config/env.js";

const router = Router();

const prefsSchema = z.object({
  notifyOnView: z.boolean(),
  notifyOnClick: z.boolean(),
});

router.get("/settings", requireAuth, async (req, res) => {
  const profile = await prisma.profile.findUnique({
    where: { userId: req.userId! },
    select: { notifyOnView: true, notifyOnClick: true },
  });

  res.json({
    success: true,
    data: {
      smtpConfigured: isEmailEnabled(),
      fromEmail: isEmailEnabled() ? getFromAddress() : null,
      notifyOnView: profile?.notifyOnView ?? false,
      notifyOnClick: profile?.notifyOnClick ?? false,
    },
  });
});

router.put("/settings", requireAuth, async (req, res) => {
  const parsed = prefsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: parsed.error.issues[0].message });
  }

  await prisma.profile.upsert({
    where: { userId: req.userId! },
    update: {
      notifyOnView: parsed.data.notifyOnView,
      notifyOnClick: parsed.data.notifyOnClick,
    },
    create: {
      userId: req.userId!,
      notifyOnView: parsed.data.notifyOnView,
      notifyOnClick: parsed.data.notifyOnClick,
    },
  });

  res.json({ success: true, data: parsed.data });
});

router.post("/test", requireAuth, async (req, res) => {
  if (!isEmailEnabled()) {
    return res.status(400).json({ success: false, error: "SMTP is not configured in .env" });
  }

  const conn = await testConnection();
  if (!conn.success) {
    return res.status(400).json({ success: false, error: conn.error });
  }

  const user = await prisma.user.findUnique({
    where: { id: req.userId! },
    select: { email: true },
  });

  if (!user?.email) {
    return res.status(400).json({ success: false, error: "No email on account" });
  }

  const env = getEnv();
  const result = await sendEmail({
    to: user.email,
    subject: `Test email from ${env.SMTP_FROM_NAME}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"></head>
      <body style="margin:0;padding:0;background-color:#09090b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
        <div style="max-width:480px;margin:40px auto;background:#18181b;border-radius:12px;border:1px solid #27272a;overflow:hidden;">
          <div style="background:linear-gradient(135deg,#7c3aed,#0ea5e9);padding:24px;text-align:center;">
            <h1 style="color:#fff;margin:0;font-size:18px;">${env.SMTP_FROM_NAME}</h1>
          </div>
          <div style="padding:24px;">
            <h2 style="color:#e4e4e7;font-size:16px;margin:0 0 12px;">Email Configured!</h2>
            <p style="color:#a1a1aa;font-size:14px;line-height:1.6;margin:0;">
              This is a test email. If you received this, your SMTP settings are working correctly.
            </p>
          </div>
          <div style="padding:16px 24px;border-top:1px solid #27272a;text-align:center;">
            <p style="color:#52525b;font-size:11px;margin:0;">Sent from ${env.SMTP_FROM_NAME}</p>
          </div>
        </div>
      </body>
      </html>
    `,
  });

  if (!result.success) {
    return res.status(400).json({ success: false, error: result.error });
  }

  res.json({ success: true });
});

export default router;
