import { renderOgCard } from "./ogCard.js";
import { buildOgPage } from "./og.js";
import { getEnv } from "../config/env.js";
import { getCachedPresence, describeActivities } from "./discordGateway.js";
import { toAbsoluteUrl, DISCORD_STATUS_LABELS } from "./discord.js";
import { resolvePublicProfile } from "./profile.js";

export interface ProfileOgData {
  username: string;
  displayName: string | null;
  bio: string | null;
  avatar: string | null;
  accent: string | null;
  status: "online" | "idle" | "dnd" | "offline" | null;
  activityLine: string | null;
  customStatus: string | null;
  linkCount: number;
  trackCount: number;
  canonicalUrl: string;
}

export async function loadProfileOgData(identifier: string): Promise<ProfileOgData | null> {
  const profile = await resolvePublicProfile(identifier, {
    slug: true,
    isPublic: true,
    displayName: true,
    bio: true,
    avatar: true,
    theme: true,
    socialLinks: true,
    showDiscordPresence: true,
    showDiscordActivity: true,
    discordConnection: { select: { discordId: true } },
    musicTracks: { select: { id: true } },
  });

  if (!profile || !profile.isPublic) return null;

  const theme = profile.theme as { accent?: unknown } | null | undefined;
  const accent = typeof theme?.accent === "string" ? theme.accent : null;
  const socialLinks = Array.isArray(profile.socialLinks) ? profile.socialLinks : null;

  let status: "online" | "idle" | "dnd" | "offline" | null = null;
  let activityLine: string | null = null;
  let customStatus: string | null = null;

  if (profile.showDiscordPresence && profile.discordConnection) {
    const presence = getCachedPresence(profile.discordConnection.discordId);
    if (presence) {
      if (presence.status === "online" || presence.status === "idle" || presence.status === "dnd" || presence.status === "offline") {
        status = presence.status;
      }
      const described = describeActivities(profile.showDiscordActivity ? presence.activities : []);
      activityLine = described.line;
      customStatus = described.customStatus;
    }
  }

  return {
    username: profile.slug,
    displayName: profile.displayName,
    bio: profile.bio,
    avatar: toAbsoluteUrl(profile.avatar),
    accent,
    status,
    activityLine,
    customStatus,
    linkCount: socialLinks?.length ?? 0,
    trackCount: profile.musicTracks.length,
    canonicalUrl: toAbsoluteUrl(`/${profile.slug}`) ?? `${getEnv().APP_URL}/${profile.slug}`,
  };
}

export async function renderProfileOgPng(identifier: string): Promise<Buffer | null> {
  const og = await loadProfileOgData(identifier);
  if (!og) return null;
  return renderOgCard({
    username: og.username,
    displayName: og.displayName,
    bio: og.bio,
    avatar: og.avatar,
    accent: og.accent,
    status: og.status,
    activityLine: og.activityLine,
    customStatus: og.customStatus,
    linkCount: og.linkCount,
    trackCount: og.trackCount,
    appName: getEnv().APP_NAME,
  });
}

export async function renderProfileOgPage(identifier: string): Promise<string | null> {
  const og = await loadProfileOgData(identifier);
  if (!og) return null;
  const env = getEnv();
  return buildOgPage({
    username: og.username,
    displayName: og.displayName,
    bio: og.bio,
    statusLabel: og.status ? (DISCORD_STATUS_LABELS[og.status] ?? og.status) : null,
    activityLine: og.activityLine,
    linkCount: og.linkCount,
    trackCount: og.trackCount,
    appName: env.APP_NAME,
    appTagline: env.APP_TAGLINE,
    imageUrl: toAbsoluteUrl(`/api/profiles/${og.username}/og.png`) ?? "",
    canonicalUrl: og.canonicalUrl,
  });
}
