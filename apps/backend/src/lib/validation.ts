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
  const trimmed = value.trim();
  let candidate = trimmed;
  if (!/^https?:\/\//i.test(candidate) && /^discord\.(gg|com|app)\//i.test(candidate)) {
    candidate = `https://${candidate}`;
  }
  if (/^https?:\/\//i.test(candidate)) {
    try {
      const url = new URL(candidate);
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
  return /^[a-z0-9_.]{2,32}$/i.test(candidate) && !/\.\./.test(candidate) && !/^\./.test(candidate) && !/\.$/.test(candidate);
}

function isSafeCssColor(value: string): boolean {
  return (
    /^#[0-9a-fA-F]{3,8}$/.test(value) ||
    /^rgba?\(\s*(\d{1,3}%?\s*,\s*){2}\d{1,3}%?\s*(,\s*(0|1|0?\.\d+)\s*)?\)$/.test(value) ||
    /^hsla?\(\s*\d{1,3}(\.\d+)?(deg)?\s*,\s*\d{1,3}%\s*,\s*\d{1,3}%\s*(,\s*(0|1|0?\.\d+)\s*)?\)$/.test(value)
  );
}

function isSafeCssFontFamily(value: string): boolean {
  return /^[a-zA-Z0-9\s,'"-]+$/.test(value) && value.length <= 128;
}

export const themeSchema = z
  .object({
    bg: z.string().max(128).refine(isSafeCssColor, { message: "Invalid background color" }).optional(),
    cardBg: z.string().max(128).refine(isSafeCssColor, { message: "Invalid card background color" }).optional(),
    text: z.string().max(128).refine(isSafeCssColor, { message: "Invalid text color" }).optional(),
    accent: z.string().max(128).refine(isSafeCssColor, { message: "Invalid accent color" }).optional(),
    fontFamily: z.string().max(128).refine(isSafeCssFontFamily, { message: "Invalid font family" }).optional(),
  })
  .nullable()
  .optional();

export const profileSlugSchema = z
  .string()
  .min(2)
  .max(64)
  .regex(/^[a-z0-9_-]+$/, { message: "Only lowercase letters, numbers, dashes and underscores" });

export const updateProfileSchema = z.object({
  slug: profileSlugSchema.optional().transform((v) => (v ? stripHtml(v) || v : v)),
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
  theme: themeSchema,
  isPublic: z.boolean().optional(),
});
