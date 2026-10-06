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
  "gitlab",
  "reddit",
  "pinterest",
  "snapchat",
  "threads",
  "bluesky",
  "mastodon",
  "whatsapp",
  "telegram",
  "signal",
  "kick",
  "steam",
  "soundcloud",
]);

const ALLOWED_URL_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

const BASE58_CHARS = "1-9A-HJ-NP-Za-km-z";
export const BTC_ADDRESS_RE = new RegExp(
  `^(bc1[02-9ac-hj-np-z]{20,80}|1[${BASE58_CHARS}]{25,62}|3[${BASE58_CHARS}]{25,62})$`
);
export const LTC_ADDRESS_RE = new RegExp(
  `^(ltc1[02-9ac-hj-np-z]{20,80}|[LM][${BASE58_CHARS}]{25,62}|3[${BASE58_CHARS}]{25,62})$`
);

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
    seasonalDecorations: z.boolean().optional(),
    alwaysAllowChristmas: z.boolean().optional(),
    animatedFx: z.boolean().optional(),
    effect: z.enum(["none", "snow", "pumpkins", "hearts", "leaves", "stars", "confetti", "sparkle"]).optional(),
    backgroundImage: z.string().max(512).nullable().optional(),
    layout: z.enum(["default", "grid", "compact", "wide", "glassmorphism", "minimal", "sidebar", "editorial", "hero", "bento", "terminal", "polaroid", "topbar"]).nullable().optional(),
  })
  .nullable()
  .optional();

export const profileSlugSchema = z
  .string()
  .min(2)
  .max(64)
  .regex(/^[a-z0-9_-]+$/, { message: "Only lowercase letters, numbers, dashes and underscores" });

export const terminalCommandsSchema = z
  .array(
    z.object({
      command: z
        .string()
        .transform((v) => stripHtml(v).toLowerCase())
        .pipe(z.string().min(1).max(24).regex(/^[a-z0-9_-]+$/, { message: "Only lowercase letters, numbers, dashes and underscores" })),
      output: z.string().min(1).max(300).transform((v) => stripHtml(v)),
      description: z
        .string()
        .max(120)
        .optional()
        .transform((v) => (v ? stripHtml(v).trim() : v)),
      url: z
        .string()
        .max(256)
        .transform((v) => stripHtml(v).trim())
        .refine(
          (v) => {
            if (!v) return true;
            if (/^(https?:|mailto:)/i.test(v)) return isSafeWebUrl(v) || /^mailto:[^\s<>]{1,256}$/i.test(v);
            return /^[a-zA-Z0-9@_.:+ -]{1,64}$/.test(v) && !/^[a-z]+:/i.test(v);
          },
          { message: "Invalid link target" }
        )
        .optional(),
    })
  )
  .max(12)
  .nullable()
  .optional()
  .refine((cmds) => {
    if (!cmds) return true;
    const seen = new Set<string>();
    for (const c of cmds) {
      const name = c.command.toLowerCase();
      if (seen.has(name)) return false;
      seen.add(name);
    }
    return true;
  }, { message: "Terminal commands must be unique" });

function tipAddressField(label: string, re: RegExp) {
  return z
    .union([
      z.string().max(128).transform((v) => stripHtml(v).replace(/\s+/g, "")).refine((v) => v === "" || re.test(v), { message: `Invalid ${label} address` }),
      z.null(),
    ])
    .transform((v) => (v === null || v === "" ? null : v));
}

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
        label: z.string().max(64).transform((v) => stripHtml(v).trim() || undefined).optional(),
        heading: z
          .string()
          .max(48)
          .transform((v) => stripHtml(v).trim() || undefined)
          .optional(),
        icon: z
          .string()
          .max(24)
          .transform((v) => stripHtml(v).trim() || undefined)
          .optional(),
        image: z
          .string()
          .max(256)
          .refine((v) => v.startsWith("/uploads/") && /^\/uploads\/[A-Za-z0-9._-]+\.[A-Za-z0-9]+$/.test(v), {
            message: "Favicon image must be a local upload path",
          })
          .optional(),
        showQr: z.boolean().optional(),
      })
    )
    .max(10)
    .nullable()
    .optional()
    .refine((links) => !links || links.every((l) => isSafeSocialUrl(l.platform, l.url)), {
      message: "One or more links have an invalid URL or username",
    }),
  theme: themeSchema,
  terminalCommands: terminalCommandsSchema,
  presenceStatus: z
    .enum(["online", "idle", "offline"])
    .nullable()
    .optional(),
  countdown: z
    .object({
      label: z
        .string()
        .max(60)
        .transform((v) => stripHtml(v).trim() || undefined),
      targetDate: z.string().refine((v) => {
        const ts = Date.parse(v);
        return !Number.isNaN(ts);
      }, { message: "Countdown target date must be a valid date/time string" }),
    })
    .nullable()
    .optional(),
  isPublic: z.boolean().optional(),
  newsletterEnabled: z.boolean().optional(),
  newsletterVisible: z.boolean().optional(),
  newsletterHeading: z
    .union([z.string().max(60), z.null()])
    .transform((v) => (v === null ? null : stripHtml(v).trim() || null))
    .optional(),
  tipsEnabled: z.boolean().optional(),
  tipsHeading: z
    .union([z.string().max(60), z.null()])
    .transform((v) => (v === null ? null : stripHtml(v).trim() || null))
    .optional(),
  tipsBtcAddress: tipAddressField("Bitcoin", BTC_ADDRESS_RE).optional(),
  tipsLtcAddress: tipAddressField("Litecoin", LTC_ADDRESS_RE).optional(),
  shopDiscountPercent: z.number().int().min(0).max(100).nullable().optional(),
});
