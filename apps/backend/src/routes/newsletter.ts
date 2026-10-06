import { Router, type Request } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { hasPermission, PERMISSIONS } from "../lib/permissions.js";
import { profileScope } from "../lib/profile.js";
import { getEnv } from "../config/env.js";
import { decryptSenderSecret, encryptSenderSecret, generateVerificationToken, sendViaSenderSmtp, testSenderSmtp, verificationRecordName, verifyDomainOwnership } from "../lib/newsletterSender.js";
import {
  POLICY_VERSIONS,
  effectiveTierConfig,
  isNewsletterSendEnabled,
  signUnsubscribeToken,
  verifyUnsubscribeToken,
  verifyBroadcastUnsubscribeToken,
  unsubscribeUrl,
  buildNewsletterEmail,
  sendNewsletterEmail,
  recordConsentEvidence,
  stripHtmlInput,
} from "../lib/newsletter.js";

const router = Router();

const EMAIL_INPUT = z.string().max(254).email({ message: "Invalid email address" });

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

// Subscribe is public (capture always allowed, even when sending is paused) —
// but it is rate-limited per IP to keep the consent record clean.
const SUBSCRIBE_LIMIT_MAX = 10;
const SUBSCRIBE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const subscribeHits = new Map<string, number[]>();

function subscribeRateLimited(request: Request): boolean {
  const ip = request.ip ?? "unknown";
  const now = Date.now();
  const cutoff = now - SUBSCRIBE_LIMIT_WINDOW_MS;
  const hits = (subscribeHits.get(ip) ?? []).filter((t) => t > cutoff);
  if (hits.length >= SUBSCRIBE_LIMIT_MAX) {
    subscribeHits.set(ip, hits);
    return true;
  }
  hits.push(now);
  subscribeHits.set(ip, hits);
  return false;
}

const subscribeSchema = z.object({
  profileId: z.string().uuid(),
  email: EMAIL_INPUT,
  agreePrivacy: z.literal(true),
});

router.post("/subscribe", async (req, res) => {
  const parsed = subscribeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: parsed.error.issues[0].message });
  }
  const profileId = parsed.data.profileId;
  const email = normalizeEmail(parsed.data.email);

  const profile = await prisma.profile.findUnique({ where: { id: profileId }, select: { id: true } });
  if (!profile) {
    return res.status(404).json({ success: false, error: "Profile not found" });
  }
  if (subscribeRateLimited(req)) {
    return res.status(429).json({ success: false, error: "Too many requests. Please try again later." });
  }

  const existing = await prisma.newsletterSubscriber.findUnique({
    where: { profileId_email: { profileId, email } },
  });

  let status: "subscribed" | "already_subscribed";
  if (existing && existing.unsubscribedAt === null) {
    status = "already_subscribed";
  } else {
    const data = {
      email,
      agreedAt: new Date(),
      tosVersion: POLICY_VERSIONS.tos,
      privacyVersion: POLICY_VERSIONS.privacy,
      unsubscribedAt: null,
    };
    await prisma.newsletterSubscriber.upsert({
      where: { profileId_email: { profileId, email } },
      update: data,
      create: { profileId, ...data },
    });
    status = "subscribed";
  }

  // Transient consent evidence (IP + UA) — in memory, 24 h TTL, never in the DB.
  recordConsentEvidence(email, profileId, req.ip, Array.isArray(req.headers["user-agent"]) ? req.headers["user-agent"][0] : req.headers["user-agent"]);

  res.status(201).json({ success: true, data: { status, email } });
});

function unsubscribePage(head: string, body: string, appName: string): string {
  const escaped = (v: string): string =>
    v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${escaped(head)}</title></head>
<body style="margin:0;padding:0;background:#09090b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:420px;margin:48px auto;background:#18181b;border:1px solid #27272a;border-radius:12px;padding:28px;color:#e4e4e7;">
    <h1 style="font-size:18px;margin:0 0 12px;">${escaped(head)}</h1>
    <p style="color:#a1a1aa;font-size:14px;line-height:1.6;margin:0;">${body}</p>
    <p style="color:#52525b;font-size:12px;margin:20px 0 0;">${escaped(appName)}</p>
  </div>
</body></html>`;
}

router.get("/unsubscribe/broadcast", async (req: Request<unknown, unknown, unknown, { token?: string }>, res) => {
  const token = req.query.token ?? "";
  const userId = verifyBroadcastUnsubscribeToken(token);
  if (!userId) {
    return res.status(400).type("html").send(unsubscribePage("Invalid link", "This unsubscribe link is invalid or has expired.", getEnv().APP_NAME));
  }

  await prisma.user.updateMany({
    where: { id: userId, newsletterOptIn: true },
    data: { newsletterOptIn: false, newsletterOptInAt: null, broadcastUnsubscribedAt: new Date() },
  });

  res
    .status(200)
    .type("html")
    .send(
      unsubscribePage(
        "You are unsubscribed",
        "You will no longer receive news and announcements from the platform. If you change your mind, you can opt back in from the Notifications settings in your account.",
        getEnv().APP_NAME
      )
    );
});

router.get("/unsubscribe", async (req: Request<unknown, unknown, unknown, { token?: string }>, res) => {
  const token = req.query.token ?? "";
  const payload = verifyUnsubscribeToken(token);
  if (!payload) {
    return res.status(400).type("html").send(unsubscribePage("Invalid link", "This unsubscribe link is invalid or has expired.", getEnv().APP_NAME));
  }

  const email = normalizeEmail(payload.email);
  await prisma.newsletterSubscriber.updateMany({
    where: { profileId: payload.profileId, email, unsubscribedAt: null },
    data: { unsubscribedAt: new Date() },
  });

  res
    .status(200)
    .type("html")
    .send(
      unsubscribePage(
        "You are unsubscribed",
        "You will no longer receive newsletters from this profile. If you change your mind, you can subscribe again from the profile page.",
        getEnv().APP_NAME
      )
    );
});

router.post("/unsubscribe/broadcast", async (req, res) => {
  const token = typeof req.query.token === "string" && req.query.token ? req.query.token : (req.body?.token ?? "");
  const userId = verifyBroadcastUnsubscribeToken(token);
  if (!userId) {
    return res.status(400).type("html").send(unsubscribePage("Invalid link", "This unsubscribe link is invalid or has expired.", getEnv().APP_NAME));
  }

  await prisma.user.updateMany({
    where: { id: userId, newsletterOptIn: true },
    data: { newsletterOptIn: false, newsletterOptInAt: null, broadcastUnsubscribedAt: new Date() },
  });

  res.status(200).json({ success: true, data: { status: "unsubscribed" } });
});

router.post("/unsubscribe", async (req, res) => {
  const token = typeof req.query.token === "string" && req.query.token ? req.query.token : (req.body?.token ?? "");
  const payload = verifyUnsubscribeToken(token);
  if (!payload) {
    return res.status(400).json({ success: false, error: "Invalid or expired unsubscribe link" });
  }
  const email = normalizeEmail(payload.email);
  await prisma.newsletterSubscriber.updateMany({
    where: { profileId: payload.profileId, email, unsubscribedAt: null },
    data: { unsubscribedAt: new Date() },
  });
  res.json({ success: true, data: { email, status: "unsubscribed" } });
});

router.post("/optin", requireAuth, async (req, res) => {
  const parsed = z.object({ enabled: z.boolean() }).safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: parsed.error.issues[0].message });
  }
  const enabled = parsed.data.enabled;
  await prisma.user.update({
    where: { id: req.userId! },
    data: {
      newsletterOptIn: enabled,
      newsletterOptInAt: enabled ? new Date() : null,
      broadcastUnsubscribedAt: enabled ? null : new Date(),
    },
  });
  res.json({ success: true, data: { enabled } });
});

const sendSchema = z.object({
  subject: z.string().min(1).max(120),
  body: z.string().min(1).max(5000),
  profileId: z.string().uuid().optional(),
});

router.post("/send", requireAuth, async (req, res) => {
  const parsed = sendSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: parsed.error.issues[0].message });
  }

  const subject = stripHtmlInput(parsed.data.subject);
  const body = stripHtmlInput(parsed.data.body);
  if (!subject || !body) {
    return res.status(400).json({ success: false, error: "Subject and body are required" });
  }

  const profile = await prisma.profile.findFirst({
    where: profileScope(req.userId!, parsed.data.profileId),
    select: { id: true, userId: true, slug: true, displayName: true, newsletterEnabled: true },
  });
  if (!profile) {
    return res.status(404).json({ success: false, error: "Profile not found" });
  }
  if (!profile.newsletterEnabled) {
    return res.status(403).json({ success: false, error: "Newsletter sending is paused. Enable it in your Email settings first." });
  }

  const user = await prisma.user.findUnique({
    where: { id: profile.userId },
    select: { id: true, tier: true, email: true, username: true, roleId: true, newsletterSenderWhitelisted: true },
  });
  if (!user) {
    return res.status(404).json({ success: false, error: "User not found" });
  }

  const sender = await prisma.newsletterSender.findUnique({ where: { profileId: profile.id } });

  let fromName: string;
  let fromEmail: string;
  const env = getEnv();
  const website = env.APP_URL.replace(/\/+$/, "");
  const mailingAddress = env.NEWSLETTER_MAILING_ADDRESS;

  // Self-deliverer path: profile owner sends via their own SMTP.
  if (sender) {
    if (!user.newsletterSenderWhitelisted) {
      if (user.tier !== "PRO" && user.tier !== "ENTERPRISE") {
        return res.status(403).json({ success: false, error: "Sending with your own SMTP requires the Pro or Enterprise tier (or an admin allowlist)." });
      }
      if (!sender.verifiedAt) {
        return res.status(403).json({ success: false, error: "Your sending domain is not verified yet. Add the TXT record on your DNS and verify it in Email settings." });
      }
    }
    if (!sender.testedAt) {
      return res.status(403).json({ success: false, error: "Send a test email first to confirm your own SMTP deliverer works." });
    }
    if (!sender.smtpPassEnc) {
      return res.status(400).json({ success: false, error: "Your SMTP password is not configured. Set it in Email settings." });
    }

    const { config } = await effectiveTierConfig();
    const effectiveTier = user.newsletterSenderWhitelisted ? "ENTERPRISE" : (user.tier as "FREE" | "PRO" | "ENTERPRISE");
    const tierConfig = config[effectiveTier] ?? config.FREE;
    if (tierConfig.sendLimit <= 0) {
      return res.status(403).json({ success: false, error: `Newsletter sending is not enabled for the ${effectiveTier} tier on this instance.` });
    }
    const windowStart = new Date(Date.now() - tierConfig.windowHours * 60 * 60 * 1000);
    const sentInWindow = await prisma.newsletterSend.count({ where: { profileId: profile.id, sentAt: { gte: windowStart } } });
    if (sentInWindow >= tierConfig.sendLimit) {
      return res.status(429).json({ success: false, error: `Newsletter send limit reached (${tierConfig.sendLimit} per ${tierConfig.windowHours} h). Try again later.` });
    }

    const cap = getEnv().NEWSLETTER_SELF_RECIPIENT_CAP;
    const subscribers = await prisma.newsletterSubscriber.findMany({
      where: { profileId: profile.id, unsubscribedAt: null },
      select: { email: true },
      orderBy: { subscribedAt: "asc" },
    });
    if (subscribers.length === 0) {
      return res.status(400).json({ success: false, error: "No active subscribers yet. Share your profile so people can subscribe." });
    }
    if (subscribers.length > cap) {
      return res.status(400).json({ success: false, error: `This send would exceed the ${cap} recipient self-deliverer safety cap.` });
    }

    fromName = sender.fromName;
    fromEmail = sender.fromEmail;
    const pass = decryptSenderSecret(sender.smtpPassEnc);

    let successCount = 0;
    const failed: string[] = [];
    for (const subscriber of subscribers) {
      const url = unsubscribeUrl(signUnsubscribeToken(profile.id, subscriber.email));
      const html = buildNewsletterEmail({ appName: env.APP_NAME, fromName, fromEmail, subject, body, unsubscribeUrl: url, mailingAddress, website });
      const result = await sendViaSenderSmtp({
        fromName, fromEmail, host: sender.smtpHost, port: sender.smtpPort, secure: sender.smtpSecure, user: sender.smtpUser, pass, to: subscriber.email, subject, html, listUnsubscribe: url,
      });
      if (result.success) successCount += 1;
      else failed.push(subscriber.email);
    }

    await prisma.newsletterSend.create({ data: { profileId: profile.id, subject, recipientCount: subscribers.length, successCount } });
    return res.json({ success: true, data: { recipientCount: subscribers.length, successCount, failedCount: failed.length } });
  }

  // Platform path: instance SMTP. Admins (newsletter.manage) bypass the user
  // limits; everyone else needs the instance-owner opt-in AND a manual
  // per-user allowlist grant, then gets the tier window + a low recipient cap.
  const role = await prisma.role.findUnique({ where: { id: user.roleId }, select: { slug: true, permissions: true } });
  const isPlatformAdmin = !!role && hasPermission(role, PERMISSIONS.NEWSLETTER_MANAGE);
  if (!isPlatformAdmin) {
    if (!env.NEWSLETTER_PLATFORM_SMTP_ENABLED) {
      return res.status(403).json({ success: false, error: "Sending with the platform sender is not enabled for users on this instance. Configure your own SMTP deliverer in Email settings instead." });
    }
    if (!user.newsletterSenderWhitelisted) {
      return res.status(403).json({ success: false, error: "Sending with the platform sender requires admin approval. Ask the instance operator to allowlist your account, or configure your own SMTP deliverer in Email settings." });
    }
    const { config } = await effectiveTierConfig();
    const tierConfig = config[user.tier] ?? config.FREE;
    if (tierConfig.sendLimit <= 0) {
      return res.status(403).json({ success: false, error: `Newsletter sending is not enabled for the ${user.tier} tier on this instance.` });
    }
    const windowStart = new Date(Date.now() - tierConfig.windowHours * 60 * 60 * 1000);
    const sentInWindow = await prisma.newsletterSend.count({ where: { profileId: profile.id, sentAt: { gte: windowStart } } });
    if (sentInWindow >= tierConfig.sendLimit) {
      return res.status(429).json({ success: false, error: `Newsletter send limit reached (${tierConfig.sendLimit} per ${tierConfig.windowHours} h). Try again later.` });
    }
  }
  if (!isNewsletterSendEnabled()) {
    return res.status(503).json({ success: false, error: "Email delivery is not configured on this instance (SMTP or Resend)." });
  }

  const subscribers = await prisma.newsletterSubscriber.findMany({
    where: { profileId: profile.id, unsubscribedAt: null },
    select: { email: true },
    orderBy: { subscribedAt: "asc" },
  });
  if (subscribers.length === 0) {
    return res.status(400).json({ success: false, error: "No active subscribers yet. Share your profile so people can subscribe." });
  }
  const platformCap = isPlatformAdmin ? 5000 : env.NEWSLETTER_PLATFORM_RECIPIENT_CAP;
  if (subscribers.length > platformCap) {
    return res.status(400).json({
      success: false,
      error: isPlatformAdmin
        ? "This send would exceed the 5000 recipient safety cap. Contact the instance operator."
        : `This send would exceed the ${platformCap} recipient cap for approved platform senders.`,
    });
  }

  fromName = env.SMTP_FROM_NAME;
  fromEmail = env.SMTP_FROM_EMAIL || env.SMTP_USER;

  let successCount = 0;
  const failed: string[] = [];
  for (const subscriber of subscribers) {
    const url = unsubscribeUrl(signUnsubscribeToken(profile.id, subscriber.email));
    const html = buildNewsletterEmail({ appName: env.APP_NAME, fromName, fromEmail, subject, body, unsubscribeUrl: url, mailingAddress, website });
    const result = await sendNewsletterEmail({ to: subscriber.email, subject, html, listUnsubscribe: url });
    if (result.success) successCount += 1;
    else failed.push(subscriber.email);
  }

  await prisma.newsletterSend.create({ data: { profileId: profile.id, subject, recipientCount: subscribers.length, successCount } });
  return res.json({ success: true, data: { recipientCount: subscribers.length, successCount, failedCount: failed.length } });
});

router.get("/subscribers", requireAuth, async (req, res) => {
  const profile = await prisma.profile.findFirst({
    where: profileScope(req.userId!, req.query.profileId),
    select: { id: true },
  });
  if (!profile) {
    return res.status(404).json({ success: false, error: "Profile not found" });
  }

  const [subscribers, total, active] = await Promise.all([
    prisma.newsletterSubscriber.findMany({
      where: { profileId: profile.id },
      orderBy: { subscribedAt: "desc" },
      select: { id: true, email: true, subscribedAt: true, agreedAt: true, unsubscribedAt: true, tosVersion: true, privacyVersion: true },
    }),
    prisma.newsletterSubscriber.count({ where: { profileId: profile.id } }),
    prisma.newsletterSubscriber.count({ where: { profileId: profile.id, unsubscribedAt: null } }),
  ]);

  res.json({ success: true, data: { subscribers, counts: { total, active, unsubscribed: total - active } } });
});

router.get("/sends", requireAuth, async (req, res) => {
  const profile = await prisma.profile.findFirst({
    where: profileScope(req.userId!, req.query.profileId),
    select: { id: true },
  });
  if (!profile) {
    return res.status(404).json({ success: false, error: "Profile not found" });
  }

  const sends = await prisma.newsletterSend.findMany({
    where: { profileId: profile.id },
    orderBy: { sentAt: "desc" },
    take: 50,
    select: { id: true, subject: true, recipientCount: true, successCount: true, sentAt: true },
  });

  res.json({ success: true, data: { sends } });
});

router.delete("/subscribers/:id", requireAuth, async (req: Request<{ id: string }>, res) => {
  const profile = await prisma.profile.findFirst({
    where: profileScope(req.userId!, req.query.profileId),
    select: { id: true },
  });
  if (!profile) {
    return res.status(404).json({ success: false, error: "Profile not found" });
  }

  const sub = await prisma.newsletterSubscriber.findFirst({
    where: { id: req.params.id, profileId: profile.id },
    select: { id: true },
  });
  if (!sub) {
    return res.status(404).json({ success: false, error: "Subscriber not found" });
  }

  await prisma.newsletterSubscriber.delete({ where: { id: sub.id } });
  res.json({ success: true, data: { deleted: 1 } });
});

// ---- Own-deliverer sender (per-profile SMTP) --------------------------------

function senderPublic(sender: {
  id: string;
  fromName: string;
  fromEmail: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string | null;
  smtpPassEnc: string | null;
  verificationToken: string | null;
  verifiedAt: Date | null;
  testedAt: Date | null;
}) {
  return {
    id: sender.id,
    fromName: sender.fromName,
    fromEmail: sender.fromEmail,
    smtpHost: sender.smtpHost,
    smtpPort: sender.smtpPort,
    smtpSecure: sender.smtpSecure,
    smtpUser: sender.smtpUser ?? "",
    hasPassword: !!sender.smtpPassEnc,
    verificationRecord: verificationRecordName(sender.fromEmail),
    verificationToken: sender.verificationToken,
    verifiedAt: sender.verifiedAt,
    testedAt: sender.testedAt,
  };
}

const senderSchema = z.object({
  profileId: z.string().uuid().optional(),
  fromName: z.string().min(1).max(60),
  fromEmail: EMAIL_INPUT,
  smtpHost: z.string().min(1).max(253),
  smtpPort: z.number().int().min(1).max(65535).default(587),
  smtpSecure: z.boolean().default(false),
  smtpUser: z.string().max(253).optional().default(""),
  smtpPassword: z.string().max(254).optional().default(""),
});

async function resolveOwnedSender(req: Request): Promise<{
  profile: { id: string } | null;
  sender: Awaited<ReturnType<typeof findSender>>;
}> {
  const profile = await prisma.profile.findFirst({
    where: profileScope(req.userId!, req.query.profileId),
    select: { id: true },
  });
  if (!profile) return { profile: null, sender: null };
  const sender = await findSender(profile.id);
  return { profile, sender };
}

async function findSender(profileId: string) {
  return prisma.newsletterSender.findUnique({ where: { profileId } });
}

router.get("/sender", requireAuth, async (req, res) => {
  const { profile, sender } = await resolveOwnedSender(req);
  if (!profile) return res.status(404).json({ success: false, error: "Profile not found" });
  res.json({ success: true, data: { sender: sender ? senderPublic(sender) : null, platformEnabled: getEnv().NEWSLETTER_PLATFORM_SMTP_ENABLED } });
});

router.put("/sender", requireAuth, async (req, res) => {
  const parsed = senderSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: parsed.error.issues[0].message });
  }
  const { profile } = await resolveOwnedSender(req);
  if (!profile) return res.status(404).json({ success: false, error: "Profile not found" });

  const fromName = stripHtmlInput(parsed.data.fromName);
  const fromEmail = normalizeEmail(parsed.data.fromEmail);
  const smtpHost = stripHtmlInput(parsed.data.smtpHost);
  const smtpUser = stripHtmlInput(parsed.data.smtpUser);
  const smtpPassword = parsed.data.smtpPassword;
  const smtpPort = parsed.data.smtpPort;
  const smtpSecure = parsed.data.smtpSecure;

  const existing = await findSender(profile.id);
  const domainChanged = !existing || existing.fromEmail.split("@")[1] !== fromEmail.split("@")[1];
  const delivererChanged = !existing || existing.smtpHost !== smtpHost || existing.smtpPort !== smtpPort || existing.smtpSecure !== smtpSecure;

  const verificationToken = existing?.verificationToken ?? generateVerificationToken();
  const verifiedAt = domainChanged ? null : (existing?.verifiedAt ?? null);
  const testedAt = domainChanged || delivererChanged || !!smtpPassword ? null : (existing?.testedAt ?? null);
  const smtpPassEnc = smtpPassword ? encryptSenderSecret(smtpPassword) : (existing?.smtpPassEnc ?? null);

  const data = {
    fromName,
    fromEmail,
    smtpHost,
    smtpPort,
    smtpSecure,
    smtpUser: smtpUser || null,
    smtpPassEnc,
    verificationToken,
    verifiedAt,
    testedAt,
  };
  const sender = await prisma.newsletterSender.upsert({
    where: { profileId: profile.id },
    update: data,
    create: { profileId: profile.id, ...data },
  });
  res.json({ success: true, data: { sender: senderPublic(sender) } });
});

router.delete("/sender", requireAuth, async (req, res) => {
  const { profile } = await resolveOwnedSender(req);
  if (!profile) return res.status(404).json({ success: false, error: "Profile not found" });
  await prisma.newsletterSender.deleteMany({ where: { profileId: profile.id } });
  res.json({ success: true, data: { sender: null } });
});

router.post("/sender/verify", requireAuth, async (req, res) => {
  const { profile, sender } = await resolveOwnedSender(req);
  if (!profile) return res.status(404).json({ success: false, error: "Profile not found" });
  if (!sender) return res.status(400).json({ success: false, error: "No sender configured for this profile yet." });
  if (!sender.verificationToken) {
    const token = generateVerificationToken();
    await prisma.newsletterSender.update({ where: { id: sender.id }, data: { verificationToken: token } });
    sender.verificationToken = token;
  }
  const record = verificationRecordName(sender.fromEmail);
  const ok = await verifyDomainOwnership(sender.fromEmail, sender.verificationToken);
  if (!ok) {
    return res.status(400).json({
      success: false,
      data: { verified: false, verificationRecord: record, verificationToken: sender.verificationToken },
      error: `TXT record not found yet. Add ${record} with the value ${sender.verificationToken} on your DNS, then verify again.`,
    });
  }
  await prisma.newsletterSender.update({ where: { id: sender.id }, data: { verifiedAt: new Date() } });
  res.json({ success: true, data: { verified: true } });
});

router.post("/sender/test", requireAuth, async (req, res) => {
  const { profile, sender } = await resolveOwnedSender(req);
  if (!profile) return res.status(404).json({ success: false, error: "Profile not found" });
  if (!sender) return res.status(400).json({ success: false, error: "No sender configured for this profile yet." });
  if (!sender.smtpPassEnc) return res.status(400).json({ success: false, error: "Set your SMTP password before sending a test email." });

  const user = await prisma.user.findUnique({ where: { id: req.userId! }, select: { email: true } });
  if (!user) return res.status(404).json({ success: false, error: "User not found" });

  const result = await testSenderSmtp({
    fromName: sender.fromName,
    fromEmail: sender.fromEmail,
    host: sender.smtpHost,
    port: sender.smtpPort,
    secure: sender.smtpSecure,
    user: sender.smtpUser,
    pass: decryptSenderSecret(sender.smtpPassEnc),
    to: user.email,
  });
  if (!result.success) {
    return res.status(400).json({ success: false, data: { tested: false }, error: `Test email failed: ${result.error}` });
  }
  await prisma.newsletterSender.update({ where: { id: sender.id }, data: { testedAt: new Date() } });
  res.json({ success: true, data: { tested: true } });
});

export default router;