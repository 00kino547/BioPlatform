import { prisma } from "./prisma.js";
import { getEnv } from "../config/env.js";
import { decryptDiscordSecret, encryptDiscordSecret, toAbsoluteUrl } from "./discord.js";
import { profileOgImageUrl } from "./profileOg.js";

export interface DiscordEmbed {
  title: string;
  url: string;
  color?: number;
  image?: { url: string };
  footer?: { text: string };
  timestamp?: string;
}

export interface ProfileEmbedData {
  id: string;
  slug: string;
  displayName: string | null;
  theme: unknown;
  discordWebhookUrlEncrypted: string | null;
  discordPostedMessageId: string | null;
  discordPostedWebhookUrlEncrypted: string | null;
}

function parseAccent(value: unknown): number | undefined {
  if (typeof value !== "string") return undefined;
  const match = /^#([0-9a-fA-F]{6})$/.exec(value.trim());
  return match ? Number.parseInt(match[1], 16) : undefined;
}

export async function buildProfileDiscordEmbed(profile: ProfileEmbedData): Promise<DiscordEmbed | null> {
  const displayName = profile.displayName ?? profile.slug;
  const imageUrl = await profileOgImageUrl(profile.slug);

  const embed: DiscordEmbed = {
    title: `${displayName} (@${profile.slug})`,
    url: toAbsoluteUrl(`/${profile.slug}`) ?? `${getEnv().APP_URL}/${profile.slug}`,
    color: parseAccent((profile.theme as { accent?: unknown } | null | undefined)?.accent) ?? 0x7c3aed,
    footer: { text: getEnv().APP_NAME },
    timestamp: new Date().toISOString(),
  };

  if (imageUrl) embed.image = { url: imageUrl };

  return embed;
}

function webhookBaseUrl(value: string): string | null {
  try {
    const url = new URL(value);
    url.search = "";
    url.hash = "";
    const path = url.pathname.replace(/\/$/, "").replace(/\/(slack|github)$/, "");
    url.pathname = path;
    return url.toString();
  } catch {
    return null;
  }
}

interface DiscordApiResult {
  ok: boolean;
  status: number;
  error: string;
  messageId?: string;
}

async function discordRequest(url: string, method: "POST" | "PATCH" | "DELETE", body?: unknown): Promise<DiscordApiResult> {
  try {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text().catch(() => "");
    if (res.ok) {
      let messageId: string | undefined;
      if (text) {
        try {
          messageId = (JSON.parse(text) as { id?: string }).id;
        } catch {
          messageId = undefined;
        }
      }
      return { ok: true, status: res.status, error: "", messageId };
    }
    return { ok: false, status: res.status, error: text ? text.slice(0, 200) : `Discord returned ${res.status}` };
  } catch (error) {
    return { ok: false, status: 0, error: error instanceof Error ? error.message : "Request failed" };
  }
}

async function clearDiscordPost(profileId: string): Promise<void> {
  await prisma.profile.update({
    where: { id: profileId },
    data: { discordPostedMessageId: null, discordPostedWebhookUrlEncrypted: null },
  });
}

export interface SyncDiscordPostResult {
  ok: boolean;
  status: number;
  error: string;
  mode: "created" | "updated" | "none";
  messageId?: string;
}

export async function syncDiscordPost(profile: ProfileEmbedData, webhookUrl?: string): Promise<SyncDiscordPostResult> {
  const resolved =
    webhookUrl ??
    (profile.discordWebhookUrlEncrypted ? decryptDiscordSecret(profile.discordWebhookUrlEncrypted, "webhook") : null);
  if (!resolved) {
    return { ok: true, status: 200, error: "", mode: "none" };
  }

  const embed = await buildProfileDiscordEmbed(profile);
  if (!embed) {
    return { ok: false, status: 500, error: "Could not build the Discord embed.", mode: "none" };
  }

  const base = webhookBaseUrl(resolved);
  if (!base) {
    return { ok: false, status: 400, error: "Invalid Discord webhook URL.", mode: "none" };
  }

  const postedUrl = profile.discordPostedWebhookUrlEncrypted
    ? decryptDiscordSecret(profile.discordPostedWebhookUrlEncrypted, "webhook")
    : null;

  if (profile.discordPostedMessageId && postedUrl && postedUrl === resolved) {
    const result = await discordRequest(`${base}/messages/${profile.discordPostedMessageId}`, "PATCH", { embeds: [embed] });
    if (result.ok) {
      return { ...result, mode: "updated" };
    }
    if (result.status === 404) {
      await clearDiscordPost(profile.id);
    } else {
      return { ...result, mode: "updated" };
    }
  }

  if (profile.discordPostedMessageId && postedUrl) {
    const oldBase = webhookBaseUrl(postedUrl);
    if (oldBase) {
      await discordRequest(`${oldBase}/messages/${profile.discordPostedMessageId}`, "DELETE");
    }
  }

  const result = await discordRequest(`${base}/messages`, "POST", { embeds: [embed] });
  if (result.ok && result.messageId) {
    await prisma.profile.update({
      where: { id: profile.id },
      data: {
        discordPostedMessageId: result.messageId,
        discordPostedWebhookUrlEncrypted: encryptDiscordSecret(resolved, "webhook"),
      },
    });
  } else {
    await clearDiscordPost(profile.id);
  }

  return { ...result, mode: result.ok ? "created" : "none" };
}

export async function deleteDiscordPost(profileId: string): Promise<void> {
  try {
    const profile = await prisma.profile.findUnique({
      where: { id: profileId },
      select: { id: true, discordPostedMessageId: true, discordPostedWebhookUrlEncrypted: true },
    });
    if (!profile || !profile.discordPostedMessageId) return;
    if (profile.discordPostedWebhookUrlEncrypted) {
      const postedUrl = decryptDiscordSecret(profile.discordPostedWebhookUrlEncrypted, "webhook");
      const base = webhookBaseUrl(postedUrl);
      if (base) await discordRequest(`${base}/messages/${profile.discordPostedMessageId}`, "DELETE");
    }
    await clearDiscordPost(profileId);
  } catch (err) {
    console.error("Discord post cleanup failed:", err);
  }
}

export async function refreshDiscordPostForProfile(profileId: string): Promise<void> {
  try {
    const profile = await prisma.profile.findUnique({
      where: { id: profileId },
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
    if (!profile) return;
    if (!profile.discordPostedMessageId) return;
    await syncDiscordPost(profile);
  } catch (err) {
    console.error("Discord post refresh failed:", err);
  }
}
