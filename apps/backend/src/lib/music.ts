import type { User } from "@prisma/client";

export const ALLOWED_PROVIDERS = new Set(["local", "spotify", "youtube"]);

const DEFAULT_LIMITS = {
  FREE: 2,
  PRO: 5,
  ENTERPRISE: 10,
} as const;

export function getTrackLimit(user: Pick<User, "tier" | "trackLimit">): number {
  if (user.trackLimit !== null && user.trackLimit !== undefined && user.trackLimit > 0) {
    return user.trackLimit;
  }
  return DEFAULT_LIMITS[user.tier] ?? 2;
}

export interface ParsedMusicUrl {
  embedUrl: string;
}

export function parseFullUrl(url: string): ParsedMusicUrl | null {
  const trimmed = url.trim();
  try {
    const parsed = new URL(trimmed);
    if (!["http:", "https:"].includes(parsed.protocol)) return null;
    if (parsed.hostname.replace(/^www\./, "").toLowerCase() === "youtube.com" || parsed.hostname.toLowerCase() === "youtu.be") {
      const embed = parseYouTubeUrl(trimmed);
      return embed ? { embedUrl: embed } : null;
    }
    return { embedUrl: trimmed };
  } catch {
    return null;
  }
}

function parseSpotifyUrl(url: string): string | null {
  let m = url.match(/^https?:\/\/(?:open|embed)\.spotify\.com\/(track|album|playlist|episode|show)\/([A-Za-z0-9]+)(?:\?.*)?$/i);
  if (m) return `https://open.spotify.com/embed/${m[1].toLowerCase()}/${m[2]}`;

  m = url.match(/^spotify:(track|album|playlist|episode|show):([A-Za-z0-9]+)$/i);
  if (m) return `https://open.spotify.com/embed/${m[1].toLowerCase()}/${m[2]}`;

  return null;
}

function parseYouTubeUrl(url: string): string | null {
  let m = url.match(/^https?:\/\/(?:www\.|m\.|music\.)?youtube\.com\/watch\?v=([A-Za-z0-9_-]{6,})(?:&.*)?$/i);
  if (m) return `https://www.youtube-nocookie.com/embed/${m[1]}`;

  m = url.match(/^https?:\/\/(?:www\.|m\.)?youtu\.be\/([A-Za-z0-9_-]{6,})(?:\?.*)?$/i);
  if (m) return `https://www.youtube-nocookie.com/embed/${m[1]}`;

  m = url.match(/^https?:\/\/(?:www\.|m\.|music\.)?youtube\.com\/embed\/([A-Za-z0-9_-]{6,})(?:\?.*)?$/i);
  if (m) return `https://www.youtube-nocookie.com/embed/${m[1]}`;

  m = url.match(/^https?:\/\/(?:www\.|m\.|music\.)?youtube\.com\/shorts\/([A-Za-z0-9_-]{6,})(?:\?.*)?$/i);
  if (m) return `https://www.youtube-nocookie.com/embed/${m[1]}`;

  m = url.match(/^https?:\/\/(?:www\.|m\.|music\.)?youtube\.com\/playlist\?list=([A-Za-z0-9_-]{6,})(?:&.*)?$/i);
  if (m) return `https://www.youtube-nocookie.com/embed/videoseries?list=${m[1]}`;

  return null;
}

export function parseMusicUrl(provider: string, url: string): ParsedMusicUrl | null {
  const trimmed = url.trim();
  if (provider === "spotify") {
    const embedUrl = parseSpotifyUrl(trimmed);
    return embedUrl ? { embedUrl } : null;
  }
  if (provider === "youtube") {
    const embedUrl = parseYouTubeUrl(trimmed);
    return embedUrl ? { embedUrl } : null;
  }
  return null;
}
