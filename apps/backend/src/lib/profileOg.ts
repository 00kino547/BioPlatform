import { createHash } from "node:crypto";
import { renderOgCard } from "./ogCard.js";
import { buildOgPage } from "./og.js";
import { getEnv } from "../config/env.js";
import { toAbsoluteUrl } from "./discord.js";
import { resolvePublicProfile } from "./profile.js";

export interface ProfileOgData {
  username: string;
  displayName: string | null;
  bio: string | null;
  avatar: string | null;
  banner: string | null;
  accent: string | null;
  linkCount: number;
  trackCount: number;
  badges: { slug: string; label: string; color: string }[];
  socialLinks: { platform: string; url: string | null }[];
  canonicalUrl: string;
}

export interface ProfileOgOptions {
  host?: string;
  root?: boolean;
}

function canonicalFor(host: string | undefined, root: boolean, slug: string): string {
  if (host) {
    return `https://${host}${root ? "" : `/${slug}`}`;
  }
  return toAbsoluteUrl(`/${slug}`) ?? `${getEnv().APP_URL}/${slug}`;
}

export async function loadProfileOgData(
  identifier: string,
  options: ProfileOgOptions = {}
): Promise<ProfileOgData | null> {
  const profile = await resolvePublicProfile(identifier, {
    slug: true,
    isPublic: true,
    displayName: true,
    bio: true,
    avatar: true,
    banner: true,
    theme: true,
    socialLinks: true,
    badges: { select: { slug: true, label: true, color: true } },
    musicTracks: { select: { id: true } },
  });

  if (!profile || !profile.isPublic) return null;

  const theme = profile.theme as { accent?: unknown } | null | undefined;
  const accent = typeof theme?.accent === "string" ? theme.accent : null;
  const socialLinks = (Array.isArray(profile.socialLinks) ? profile.socialLinks : null) as { platform?: string; url?: string }[] | null;

  return {
    username: profile.slug,
    displayName: profile.displayName,
    bio: profile.bio,
    avatar: toAbsoluteUrl(profile.avatar),
    banner: toAbsoluteUrl(profile.banner),
    accent,
    linkCount: socialLinks?.length ?? 0,
    trackCount: profile.musicTracks.length,
    badges: profile.badges.map((b) => ({ slug: b.slug, label: b.label, color: b.color })),
    socialLinks: (socialLinks ?? []).map((l) => ({ platform: typeof l.platform === "string" ? l.platform : "link", url: typeof l.url === "string" ? l.url : null })),
    canonicalUrl: canonicalFor(options.host, options.root ?? false, profile.slug),
  };
}

interface OgCacheEntry {
  buffer: Buffer;
  etag: string;
  createdAt: number;
}

const ogPngCache = new Map<string, OgCacheEntry>();
const OG_PNG_CACHE_MAX = 200;
const OG_PNG_CACHE_TTL_MS = 5 * 60 * 1000;

function ogCacheKey(og: ProfileOgData): string {
  return [
    og.username,
    og.displayName,
    og.bio,
    og.avatar,
    og.banner,
    og.accent,
    og.badges.map((b) => `${b.slug}:${b.label}:${b.color}`).join(","),
    og.socialLinks.map((s) => s.platform).join(","),
    og.trackCount,
  ].join("\u0001");
}

async function renderOgCardFor(og: ProfileOgData): Promise<Buffer> {
  return renderOgCard({
    username: og.username,
    displayName: og.displayName,
    bio: og.bio,
    avatar: og.avatar,
    banner: og.banner,
    accent: og.accent,
    linkCount: og.linkCount,
    trackCount: og.trackCount,
    badges: og.badges,
    socialLinks: og.socialLinks,
    appName: getEnv().APP_NAME,
  });
}

function ogVersion(og: ProfileOgData): string {
  return createHash("sha1").update(ogCacheKey(og)).digest("hex").slice(0, 8);
}

export function profileOgImageUrl(og: ProfileOgData, options?: ProfileOgOptions): Promise<string | null>;
export async function profileOgImageUrl(
  identifier: string,
  options?: ProfileOgOptions
): Promise<string | null>;
export async function profileOgImageUrl(
  identifierOrOg: string | ProfileOgData,
  options: ProfileOgOptions = {}
): Promise<string | null> {
  const og =
    typeof identifierOrOg === "string"
      ? await loadProfileOgData(identifierOrOg, options)
      : identifierOrOg;
  if (!og) return null;
  const path = `/api/profiles/${og.username}/og.png`;
  const base = options.host
    ? `https://${options.host}${path}`
    : (toAbsoluteUrl(path) ?? `${getEnv().APP_URL}${path}`);
  return `${base}?v=${ogVersion(og)}`;
}

export async function renderProfileOgPng(identifier: string): Promise<Buffer | null> {
  const og = await loadProfileOgData(identifier);
  if (!og) return null;
  return renderOgCardFor(og);
}

export async function renderProfileOgCached(identifier: string): Promise<{ buffer: Buffer; etag: string } | null> {
  const og = await loadProfileOgData(identifier);
  if (!og) return null;

  const key = ogCacheKey(og);
  const now = Date.now();
  const entry = ogPngCache.get(key);
  if (entry && now - entry.createdAt < OG_PNG_CACHE_TTL_MS) {
    return { buffer: entry.buffer, etag: entry.etag };
  }

  const buffer = await renderOgCardFor(og);
  const etag = `"${createHash("sha1").update(key).digest("hex").slice(0, 16)}"`;
  ogPngCache.set(key, { buffer, etag, createdAt: now });
  if (ogPngCache.size > OG_PNG_CACHE_MAX) {
    const oldestKey = ogPngCache.keys().next().value;
    if (oldestKey !== undefined) ogPngCache.delete(oldestKey);
  }
  return { buffer, etag };
}

export async function renderProfileOgPage(
  identifier: string,
  options: ProfileOgOptions = {}
): Promise<string | null> {
  const og = await loadProfileOgData(identifier, options);
  if (!og) return null;
  const env = getEnv();
  const imageUrl = await profileOgImageUrl(og, options);
  return buildOgPage({
    username: og.username,
    displayName: og.displayName,
    bio: og.bio,
    avatar: og.avatar,
    sameAs: og.socialLinks.filter((l): l is { platform: string; url: string } => l.url !== null && /^https?:\/\//i.test(l.url)).map((l) => l.url),
    appName: env.APP_NAME,
    appTagline: env.APP_TAGLINE,
    imageUrl: imageUrl ?? "",
    canonicalUrl: og.canonicalUrl,
  });
}
