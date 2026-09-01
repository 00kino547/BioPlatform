import { prisma } from "./prisma.js";
import { getEnv } from "../config/env.js";

const SITEMAP_MAX_URLS = 50_000;
const LLMS_MAX_PROFILES = 500;

interface CacheEntry {
  value: string | null;
  createdAt: number;
}

const cache = new Map<string, CacheEntry>();

function cached(key: string, ttlMs: number, build: () => Promise<string>): Promise<string> {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.createdAt < ttlMs) {
    return Promise.resolve(entry.value as string);
  }
  return build().then((value) => {
    cache.set(key, { value, createdAt: Date.now() });
    if (cache.size > 100) {
      const oldestKey = cache.keys().next().value;
      if (oldestKey !== undefined) cache.delete(oldestKey);
    }
    return value;
  });
}

function baseUrl(): string {
  return getEnv().APP_URL.replace(/\/+$/, "");
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function singleLine(value: string | null | undefined, max = 200): string {
  const clean = (value ?? "").replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

function robotsTxt(): string {
  const base = baseUrl();
  return [
    "User-agent: *",
    "Allow: /",
    "Disallow: /api/",
    "Disallow: /admin",
    "Disallow: /dashboard",
    "Disallow: /login",
    "Disallow: /register",
    "Disallow: /unlock",
    "",
    `Sitemap: ${base}/sitemap.xml`,
    "",
  ].join("\n");
}

interface SitemapProfile {
  slug: string;
  updatedAt: Date;
}

const STATIC_PAGES = [
  { path: "/privacy", changefreq: "monthly", priority: "0.5" },
  { path: "/terms", changefreq: "monthly", priority: "0.5" },
  { path: "/api-docs", changefreq: "monthly", priority: "0.5" },
] as const;

async function publicProfiles(opts?: { take?: number; skip?: number }): Promise<SitemapProfile[]> {
  return prisma.profile.findMany({
    where: { isPublic: true },
    select: { slug: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
    take: opts?.take ?? SITEMAP_MAX_URLS,
    skip: opts?.skip ?? 0,
  });
}

function profileUrl(entry: SitemapProfile, base: string): string {
  const lastmod = entry.updatedAt.toISOString().slice(0, 10);
  return `<url><loc>${escapeXml(`${base}/${entry.slug}`)}</loc><lastmod>${lastmod}</lastmod><changefreq>monthly</changefreq><priority>0.7</priority></url>`;
}

function urlsetXml(base: string, profiles: SitemapProfile[]): string {
  const urls = [
    `<url><loc>${escapeXml(base)}/</loc><lastmod>${new Date().toISOString().slice(0, 10)}</lastmod><changefreq>daily</changefreq><priority>1.0</priority></url>`,
    ...profiles.map((p) => profileUrl(p, base)),
    ...STATIC_PAGES.map(
      (s) =>
        `<url><loc>${escapeXml(`${base}${s.path}`)}</loc><changefreq>${s.changefreq}</changefreq><priority>${s.priority}</priority></url>`
    ),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
}

function sitemapIndexXml(base: string, count: number): string {
  const sitemaps = Array.from({ length: count }, (_, i) => i).map(
    (i) =>
      `<sitemap><loc>${escapeXml(`${base}/sitemap-${i}.xml`)}</loc></sitemap>`
  );
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemaps.join("\n")}\n</sitemapindex>\n`;
}

async function sitemapXml(): Promise<string> {
  const base = baseUrl();
  const count = await prisma.profile.count({ where: { isPublic: true } });
  if (count > SITEMAP_MAX_URLS) {
    const pages = Math.ceil(count / SITEMAP_MAX_URLS);
    return sitemapIndexXml(base, pages);
  }
  const profiles = await publicProfiles();
  return urlsetXml(base, profiles);
}

async function subSitemapXml(index: number): Promise<string | null> {
  const base = baseUrl();
  const count = await prisma.profile.count({ where: { isPublic: true } });
  const pages = Math.ceil(count / SITEMAP_MAX_URLS);
  if (count <= SITEMAP_MAX_URLS || index < 0 || index >= pages) {
    return null;
  }
  const profiles = await publicProfiles({ skip: index * SITEMAP_MAX_URLS, take: SITEMAP_MAX_URLS });
  return urlsetXml(base, profiles);
}

interface LlmsProfile {
  slug: string;
  displayName: string | null;
  bio: string | null;
  website: string | null;
  socialLinks: { platform?: string; url?: string }[] | null;
}

async function llmsProfiles(): Promise<LlmsProfile[]> {
  const profiles = await prisma.profile.findMany({
    where: { isPublic: true },
    select: { slug: true, displayName: true, bio: true, website: true, socialLinks: true },
    orderBy: { updatedAt: "desc" },
    take: LLMS_MAX_PROFILES,
  });
  return profiles.map((p) => ({
    slug: p.slug,
    displayName: p.displayName,
    bio: p.bio,
    website: p.website,
    socialLinks: (Array.isArray(p.socialLinks) ? p.socialLinks : null) as { platform?: string; url?: string }[] | null,
  }));
}

function llmsHeader(): string {
  const env = getEnv();
  const base = baseUrl();
  return [
    `# ${env.APP_NAME}`,
    "",
    `> ${env.APP_TAGLINE}`,
    "",
    "## Key Links",
    `- [Home](${base}/)`,
    `- [API Docs](${base}/api-docs)`,
    `- [Privacy Policy](${base}/privacy)`,
    `- [Terms of Service](${base}/terms)`,
    "",
  ].join("\n");
}

async function llmsTxt(): Promise<string> {
  const base = baseUrl();
  const profiles = await llmsProfiles();
  const lines = profiles.map((p) => {
    const label = singleLine(p.displayName || p.bio || p.slug, 120);
    return `- [@${p.slug}](${base}/${p.slug}): ${label}`;
  });
  return `${llmsHeader()}## Profiles\n${lines.join("\n") || "(no public profiles yet)"}\n`;
}

async function llmsTxtFull(): Promise<string> {
  const profiles = await llmsProfiles();
  const blocks = profiles.map((p) => {
    const social = (Array.isArray(p.socialLinks) ? p.socialLinks : []).filter(
      (l): l is { platform: string; url: string } => typeof l.url === "string" && /^https?:\/\//i.test(l.url)
    );
    const lines = [
      `### @${p.slug}`,
      `- Name: ${singleLine(p.displayName, 200) || p.slug}`,
      p.bio ? `- Bio: ${singleLine(p.bio, 500)}` : null,
      p.website ? `- Website: ${p.website}` : null,
      social.length > 0 ? `- Social:\n${social.map((l) => `  - ${l.platform || "link"}: ${l.url}`).join("\n")}` : null,
      "",
    ];
    return lines.filter((line): line is string => line !== null).join("\n");
  });
  const overflow = profiles.length === LLMS_MAX_PROFILES ? `\n_(+${LLMS_MAX_PROFILES} or more profiles — ask the site for the full list.)_\n` : "";
  return `${llmsHeader()}## Profiles\n\n${blocks.join("\n") || "(no public profiles yet)"}\n${overflow}`;
}

export async function buildRobotsTxt(): Promise<string> {
  return cached("robots.txt", 60 * 60 * 1000, async () => robotsTxt());
}

export async function buildSitemapXml(): Promise<string> {
  return cached("sitemap.xml", 10 * 60 * 1000, sitemapXml);
}

export async function buildSubSitemapXml(index: number): Promise<string | null> {
  const key = `sitemap-${index}.xml`;
  const entry = cache.get(key);
  if (entry && Date.now() - entry.createdAt < 10 * 60 * 1000) {
    return entry.value;
  }
  const value = await subSitemapXml(index);
  cache.set(key, { value, createdAt: Date.now() });
  if (cache.size > 100) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey !== undefined) cache.delete(oldestKey);
  }
  return value;
}

export async function buildLlmstxt(): Promise<string> {
  return cached("llms.txt", 60 * 60 * 1000, llmsTxt);
}

export async function buildLlmstxtFull(): Promise<string> {
  return cached("llms-full.txt", 60 * 60 * 1000, llmsTxtFull);
}
