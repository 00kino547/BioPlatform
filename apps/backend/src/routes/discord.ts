import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { requireApiLevel } from "../middleware/admin.js";
import { getEnv } from "../config/env.js";
import {
  isDiscordConfigured,
  createOAuthState,
  verifyOAuthState,
  buildDiscordAuthorizeUrl,
  exchangeDiscordCode,
  fetchDiscordUser,
  encryptDiscordSecret,
  decryptDiscordSecret,
  isDiscordWebhookUrl,
  buildDiscordAvatarUrl,
  DISCORD_STATUS_LABELS,
} from "../lib/discord.js";
import {
  getCachedPresence,
  describeActivities,
  isSessionActive,
} from "../lib/discordGateway.js";
import { syncDiscordPost, deleteDiscordPost } from "../lib/discordPost.js";
import { profileScope, getPrimaryProfile } from "../lib/profile.js";

const router = Router();

function frontendPath(path: string): string {
  return `${getEnv().APP_URL.replace(/\/$/, "")}${path}`;
}

function presenceHubUrl(value: string): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

router.get("/", requireAuth, requireApiLevel("advanced"), async (req, res) => {
  const profile = await prisma.profile.findFirst({ where: profileScope(req.userId!, req.query.profileId) });
  const connection = profile
    ? await prisma.discordConnection.findUnique({ where: { profileId: profile.id } })
    : null;

  let presence: unknown = null;
  if (connection && profile?.showDiscordPresence) {
    const cached = getCachedPresence(connection.discordId);
    const status = cached?.status ?? "offline";
    const described = describeActivities(profile.showDiscordActivity ? cached?.activities ?? [] : []);
    presence = {
      status,
      statusLabel: DISCORD_STATUS_LABELS[status] ?? status,
      activities: profile.showDiscordActivity ? cached?.activities ?? [] : [],
      line: described.line,
      customStatus: described.customStatus,
      updatedAt: cached?.updatedAt ?? null,
    };
  }

  res.json({
    success: true,
    data: {
      configured: isDiscordConfigured(),
      connected: Boolean(connection),
      botConfigured: Boolean(getEnv().DISCORD_BOT_TOKEN),
      presenceHubInvite: presenceHubUrl(getEnv().DISCORD_GUILD_INVITE),
      sessionActive: connection ? isSessionActive() : false,
      discord: connection
        ? {
            username: connection.username,
            globalName: connection.globalName,
            avatar: buildDiscordAvatarUrl(connection.discordId, connection.avatar),
          }
        : null,
      settings: {
        showDiscordPresence: profile?.showDiscordPresence ?? false,
        showDiscordActivity: profile?.showDiscordActivity ?? true,
      },
      webhookConfigured: Boolean(profile?.discordWebhookUrlEncrypted),
      presence,
    },
  });
});

router.get("/connect", requireAuth, requireApiLevel("advanced"), (req, res) => {
  if (!isDiscordConfigured()) {
    return res.status(400).json({ success: false, error: "Discord integration is not configured on this instance." });
  }
  const url = buildDiscordAuthorizeUrl(createOAuthState(req.userId!));
  res.json({ success: true, data: { url } });
});

router.get("/callback", async (req, res) => {
  const code = typeof req.query.code === "string" ? req.query.code : "";
  const state = typeof req.query.state === "string" ? req.query.state : "";
  const error = typeof req.query.error === "string" ? req.query.error : "";

  if (error || !code || !state) {
    return res.redirect(frontendPath("/dashboard?tab=discord&discord=error"));
  }

  const userId = verifyOAuthState(state);
  if (!userId) {
    return res.redirect(frontendPath("/dashboard?tab=discord&discord=error"));
  }

  try {
    const tokens = await exchangeDiscordCode(code);
    const discordUser = await fetchDiscordUser(tokens.accessToken);
    const expiresAt = new Date(Date.now() + tokens.expiresIn * 1000);

    const primary = await getPrimaryProfile(userId);
    if (!primary) {
      return res.redirect(frontendPath("/dashboard?tab=discord&discord=error"));
    }

    await prisma.discordConnection.upsert({
      where: { profileId: primary.id },
      update: {
        discordId: discordUser.id,
        username: discordUser.username,
        globalName: discordUser.globalName,
        avatar: discordUser.avatar,
        accessTokenEncrypted: encryptDiscordSecret(tokens.accessToken, "token"),
        refreshTokenEncrypted: encryptDiscordSecret(tokens.refreshToken, "token"),
        tokenExpiresAt: expiresAt,
      },
      create: {
        profileId: primary.id,
        discordId: discordUser.id,
        username: discordUser.username,
        globalName: discordUser.globalName,
        avatar: discordUser.avatar,
        accessTokenEncrypted: encryptDiscordSecret(tokens.accessToken, "token"),
        refreshTokenEncrypted: encryptDiscordSecret(tokens.refreshToken, "token"),
        tokenExpiresAt: expiresAt,
      },
    });

    return res.redirect(frontendPath("/dashboard?tab=discord&discord=connected"));
  } catch (error) {
    console.error("Discord OAuth callback failed:", error);
    return res.redirect(frontendPath("/dashboard?tab=discord&discord=error"));
  }
});

router.post("/disconnect", requireAuth, requireApiLevel("advanced"), async (req, res) => {
  const profile = await prisma.profile.findFirst({ where: profileScope(req.userId!, req.query.profileId) });
  if (!profile) {
    return res.status(404).json({ success: false, error: "Profile not found" });
  }

  const connection = await prisma.discordConnection.findUnique({ where: { profileId: profile.id } });
  if (connection) {
    await prisma.discordConnection.delete({ where: { profileId: profile.id } });
    await prisma.profile.update({ where: { id: profile.id }, data: { showDiscordPresence: false } });
  }
  res.json({ success: true });
});

const settingsSchema = z.object({
  showDiscordPresence: z.boolean().optional(),
  showDiscordActivity: z.boolean().optional(),
  webhookUrl: z
    .union([z.literal(""), z.string().max(512)])
    .refine((value) => value === "" || isDiscordWebhookUrl(value), { message: "Invalid Discord webhook URL." })
    .optional(),
});

router.put("/settings", requireAuth, requireApiLevel("advanced"), async (req, res) => {
  const parsed = settingsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: parsed.error.issues[0]?.message ?? "Invalid settings." });
  }

  let profile = await prisma.profile.findFirst({ where: profileScope(req.userId!, req.query.profileId) });
  if (!profile) {
    const primary = await getPrimaryProfile(req.userId!);
    if (!primary) {
      return res.status(404).json({ success: false, error: "Profile not found" });
    }
    profile = primary;
  }

  const data: {
    showDiscordPresence?: boolean;
    showDiscordActivity?: boolean;
    discordWebhookUrlEncrypted?: string | null;
  } = {};
  if (parsed.data.showDiscordPresence !== undefined) data.showDiscordPresence = parsed.data.showDiscordPresence;
  if (parsed.data.showDiscordActivity !== undefined) data.showDiscordActivity = parsed.data.showDiscordActivity;
  if (parsed.data.webhookUrl !== undefined) {
    data.discordWebhookUrlEncrypted =
      parsed.data.webhookUrl === "" ? null : encryptDiscordSecret(parsed.data.webhookUrl, "webhook");
  }

  await prisma.profile.update({ where: { id: profile.id }, data });

  if (parsed.data.webhookUrl !== undefined) {
    const newUrl = parsed.data.webhookUrl.trim();
    const posted = await prisma.profile.findUnique({
      where: { id: profile.id },
      select: { discordPostedMessageId: true, discordPostedWebhookUrlEncrypted: true },
    });
    if (posted?.discordPostedMessageId && posted.discordPostedWebhookUrlEncrypted) {
      const oldUrl = decryptDiscordSecret(posted.discordPostedWebhookUrlEncrypted, "webhook");
      if (newUrl !== oldUrl) {
        await deleteDiscordPost(profile.id);
      }
    }
  }

  res.json({ success: true });
});

const postSchema = z.object({
  url: z
    .string()
    .max(512)
    .refine(isDiscordWebhookUrl, { message: "Invalid Discord webhook URL." })
    .optional(),
});

router.post("/post", requireAuth, requireApiLevel("advanced"), async (req, res) => {
  const parsed = postSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: parsed.error.issues[0]?.message ?? "Invalid webhook URL." });
  }

  const profile = await prisma.profile.findFirst({
    where: profileScope(req.userId!, req.query.profileId),
    select: {
      id: true,
      slug: true,
      displayName: true,
      theme: true,
      discordWebhookUrlEncrypted: true,
      discordPostedMessageId: true,
      discordPostedWebhookUrlEncrypted: true,
    },
  });
  if (!profile) {
    return res.status(404).json({ success: false, error: "Profile not found" });
  }

  let webhookUrl = parsed.data.url ?? null;
  if (!webhookUrl) {
    if (!profile.discordWebhookUrlEncrypted) {
      return res.status(400).json({ success: false, error: "No Discord webhook configured. Paste a webhook URL first." });
    }
    webhookUrl = decryptDiscordSecret(profile.discordWebhookUrlEncrypted, "webhook");
  }

  const result = await syncDiscordPost(profile, webhookUrl);
  if (!result.ok) {
    return res.status(result.status >= 400 && result.status < 500 ? result.status : 502).json({
      success: false,
      error: `Discord webhook failed (${result.status}): ${result.error}`,
    });
  }

  res.json({ success: true, data: { messageId: result.messageId ?? null, mode: result.mode } });
});

export default router;
