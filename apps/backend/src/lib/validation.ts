import { z } from "zod";
import { Prisma } from "@prisma/client";

export function toPrismaJson(val: unknown) {
  if (val === null) return Prisma.JsonNull;
  if (val === undefined) return undefined;
  return val as Prisma.InputJsonValue;
}

export const ALLOWED_PLATFORMS = new Set([
  "twitter",
  "x",
  "github",
  "youtube",
  "twitch",
  "discord",
  "tiktok",
  "instagram",
  "facebook",
  "linkedin",
  "spotify",
  "email",
]);

const ALLOWED_URL_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

export function stripHtml(input: string): string {
  return input.replace(/[<>{}]/g, "").replace(/\s+/g, " ").trim();
}

export function isSafeWebUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function isSafeSocialUrl(platform: string, value: string): boolean {
  const platformLower = platform.toLowerCase();
  if (platformLower === "email") {
    const v = value.startsWith("mailto:") ? value.slice(7) : value;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) && v.length <= 256;
  }
  if (platformLower === "discord") {
    return isValidDiscordUsername(value);
  }
  try {
    const url = new URL(value.trim());
    return ALLOWED_URL_PROTOCOLS.has(url.protocol) && value.length <= 256;
  } catch {
    return false;
  }
}

export function isValidDiscordUsername(value: string): boolean {
  if (/^https?:\/\//i.test(value)) {
    try {
      const url = new URL(value);
      const h = url.hostname.toLowerCase();
      return (
        (h === "discord.gg" || h.endsWith(".discord.gg") || h === "discord.com" || h === "discordapp.com") &&
          /^\/invite\/.+/.test(url.pathname) ||
        (h === "discord.gg" && /^\/.+/.test(url.pathname) && !url.pathname.startsWith("/invite"))
      );
    } catch {
      return false;
    }
  }
  return /^[a-z0-9_.]{2,32}$/i.test(value) && !/\.\./.test(value) && !/^\./.test(value) && !/\.$/.test(value);
}

export const updateProfileSchema = z.object({
  displayName: z.string().max(64).nullable().optional().transform((v) => (v ? stripHtml(v) : v)),
  bio: z.string().max(500).nullable().optional().transform((v) => (v ? stripHtml(v) : v)),
  location: z.string().max(100).nullable().optional().transform((v) => (v ? stripHtml(v) : v)),
  website: z.string().max(256).refine(isSafeWebUrl).transform((v) => (v ? v.trim() : v)).nullable().optional(),
  socialLinks: z
    .array(
      z.object({
        platform: z.string().max(32).refine((p) => ALLOWED_PLATFORMS.has(p.toLowerCase()), {
          message: "Unsupported platform",
        }),
        url: z.string().max(256).transform((v) => stripHtml(v)),
      })
    )
    .max(10)
    .nullable()
    .optional()
    .refine((links) => !links || links.every((l) => isSafeSocialUrl(l.platform, l.url)), {
      message: "One or more links have an invalid URL or username",
    }),
  theme: z
    .object({
      bg: z.string().optional(),
      cardBg: z.string().optional(),
      text: z.string().optional(),
      accent: z.string().optional(),
      fontFamily: z.string().optional(),
    })
    .nullable()
    .optional(),
  isPublic: z.boolean().optional(),
});
