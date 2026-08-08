import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
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
  toAbsoluteUrl,
  DISCORD_STATUS_LABELS,
} from "../lib/discord.js";
import {
  getCachedPresence,
  describeActivities,
  isSessionActive,
} from "../lib/discordGateway.js";
import { profileScope, getPrimaryProfile } from "../lib/profile.js";

const router = Router();

function frontendPath(path: string): string {
  return `${getEnv().APP_URL.replace(/\/$/, "")}${path}`;
}

function parseAccent(value: unknown): number | undefined {
  if (typeof value !== "string") return undefined;
  const match = /^#([0-9a-fA-F]{6})$/.exec(value.trim());
  return match ? Number.parseInt(match[1], 16) : undefined;
}

router.get("/", requireAuth, async (req, res) => {
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

router.get("/connect", requireAuth, (req, res) => {
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

router.post("/disconnect", requireAuth, async (req, res) => {
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

router.put("/settings", requireAuth, async (req, res) => {
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

  res.json({ success: true });
});

const postSchema = z.object({
  url: z
    .string()
    .max(512)
    .refine(isDiscordWebhookUrl, { message: "Invalid Discord webhook URL." })
    .optional(),
});

interface DiscordEmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

interface DiscordEmbed {
  title: string;
  url: string;
  description?: string;
  color?: number;
  thumbnail?: { url: string };
  fields: DiscordEmbedField[];
  footer?: { text: string };
  timestamp?: string;
}

async function buildDiscordEmbed(userId: string, profile: {
  displayName: string | null;
  bio: string | null;
  avatar: string | null;
  theme: unknown;
  showDiscordPresence: boolean;
  showDiscordActivity: boolean;
  discordConnection: { discordId: string } | null;
}): Promise<DiscordEmbed | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { username: true },
  });

  const username = user?.username ?? userId;
  const displayName = profile.displayName ?? username;

  const embed: DiscordEmbed = {
    title: `${displayName} (@${username})`,
    url: toAbsoluteUrl(`/${username}`) ?? `${getEnv().APP_URL}/${username}`,
    description: profile.bio ?? undefined,
    color: parseAccent((profile.theme as { accent?: unknown } | null | undefined)?.accent) ?? 0x7c3aed,
    fields: [],
    footer: { text: getEnv().APP_NAME },
    timestamp: new Date().toISOString(),
  };

  const avatar = toAbsoluteUrl(profile.avatar ?? null);
  if (avatar) embed.thumbnail = { url: avatar };

  if (profile.showDiscordPresence && profile.discordConnection) {
    const presence = getCachedPresence(profile.discordConnection.discordId);
    if (presence) {
      const statusLabel = DISCORD_STATUS_LABELS[presence.status] ?? presence.status;
      embed.fields.push({ name: "Status", value: statusLabel, inline: true });
      const described = describeActivities(profile.showDiscordActivity ? presence.activities : []);
      if (described.line) {
        embed.fields.push({ name: "Activity", value: described.line, inline: true });
      }
    }
  }

  return embed;
}

async function sendDiscordWebhook(url: string, embed: DiscordEmbed): Promise<{ ok: boolean; status: number; error: string }> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ embeds: [embed] }),
    });
    if (res.ok) return { ok: true, status: res.status, error: "" };
    const text = await res.text().catch(() => "");
    return { ok: false, status: res.status, error: text ? text.slice(0, 200) : `Discord returned ${res.status}` };
  } catch (error) {
    return { ok: false, status: 0, error: error instanceof Error ? error.message : "Request failed" };
  }
}

router.post("/post", requireAuth, async (req, res) => {
  const parsed = postSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: parsed.error.issues[0]?.message ?? "Invalid webhook URL." });
  }

  const profile = await prisma.profile.findFirst({
    where: profileScope(req.userId!, req.query.profileId),
    select: {
      displayName: true,
      bio: true,
      avatar: true,
      theme: true,
      showDiscordPresence: true,
      showDiscordActivity: true,
      discordConnection: { select: { discordId: true } },
      discordWebhookUrlEncrypted: true,
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

  const embed = await buildDiscordEmbed(req.userId!, profile);
  if (!embed) {
    return res.status(500).json({ success: false, error: "Could not build the Discord embed." });
  }

  const result = await sendDiscordWebhook(webhookUrl, embed);
  if (!result.ok) {
    return res.status(result.status >= 400 && result.status < 500 ? result.status : 502).json({
      success: false,
      error: `Discord webhook failed (${result.status}): ${result.error}`,
    });
  }

  res.json({ success: true });
});

export default router;
