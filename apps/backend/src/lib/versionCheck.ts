import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { getEnv } from "../config/env.js";

export interface ChangelogSection {
  heading: string;
  items: string[];
}

export interface ChangelogVersion {
  version: string;
  date?: string;
  sections: ChangelogSection[];
}

export type UpdateSeverity = "none" | "update" | "security" | "critical";

export interface VersionCheckData {
  enabled: boolean;
  installed: string;
  latest: string | null;
  outdated: boolean;
  severity: UpdateSeverity;
  skippedVersions: ChangelogVersion[];
  skippedCount: number;
  releaseUrl: string;
  releasesUrl: string;
  changelogUrl: string;
  checkedAt: string;
  source: string;
  error?: string;
}

const LOCKDOWN_MESSAGE =
  "A critical or security update is required before changing security settings. Update the app to continue.";

const FALLBACK_REPO_URL = "https://github.com/00kino547/BioPlatform";
const FALLBACK_VERSION = "unknown";

function installedVersionCandidates(): string[] {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return [
    path.resolve(here, "../../package.json"),
    path.resolve(here, "../package.json"),
    path.resolve(process.cwd(), "apps/backend/package.json"),
    path.resolve(process.cwd(), "package.json"),
  ];
}

export function getInstalledVersion(): string {
  for (const candidate of installedVersionCandidates()) {
    try {
      const parsed = JSON.parse(readFileSync(candidate, "utf8")) as { version?: unknown };
      if (typeof parsed.version === "string" && parsed.version) {
        return parsed.version;
      }
    } catch {
      // try next candidate
    }
  }
  console.error("[version] Could not read installed version from any package.json candidate. Lockdown decisions will be skipped.");
  return FALLBACK_VERSION;
}

function repoUrl(): string {
  return getEnv().APP_GITHUB_URL.replace(/\/+$/, "");
}

function parseRepo(url: string): { owner: string; repo: string } {
  const match = url.match(/github\.com\/([^/]+)\/([^/]+)/i);
  const fallback = FALLBACK_REPO_URL.match(/github\.com\/([^/]+)\/([^/]+)/i)!;
  const owner = (match?.[1] ?? fallback[1]).replace(/[^a-zA-Z0-9_-]/g, "");
  const repo = (match?.[2] ?? fallback[2]).replace(/[^a-zA-Z0-9_.-]/g, "").replace(/\.git$/, "");
  return { owner, repo };
}

const VERSION_HEADER = /^##\s+\[([^\]]+)\]\s*(?:-\s*([0-9]{4}-[0-9]{2}-[0-9]{2}))?/;
const SECTION_HEADER = /^###\s+(.+)/;
const ITEM = /^\s*[-*]\s+(.+)$/;

export function parseChangelog(markdown: string): ChangelogVersion[] {
  const versions: ChangelogVersion[] = [];
  let current: ChangelogVersion | null = null;
  let currentSection: ChangelogSection | null = null;
  let inCodeFence = false;

  for (const line of markdown.split(/\r?\n/)) {
    if (line.trimStart().startsWith("```")) {
      inCodeFence = !inCodeFence;
      continue;
    }
    if (inCodeFence) continue;

    const versionMatch = line.match(VERSION_HEADER);
    if (versionMatch) {
      const version = versionMatch[1].trim();
      if (version.toLowerCase() === "unreleased") {
        current = null;
        currentSection = null;
        continue;
      }
      current = { version, date: versionMatch[2]?.trim() || undefined, sections: [] };
      currentSection = null;
      versions.push(current);
      continue;
    }

    if (!current) continue;

    const sectionMatch = line.match(SECTION_HEADER);
    if (sectionMatch) {
      currentSection = { heading: sectionMatch[1].trim(), items: [] };
      current.sections.push(currentSection);
      continue;
    }

    if (currentSection) {
      const itemMatch = line.match(ITEM);
      if (itemMatch) {
        currentSection.items.push(itemMatch[1].trim());
        continue;
      }
      const trimmed = line.trim();
      if (trimmed) {
        const last = currentSection.items.length - 1;
        if (last >= 0) currentSection.items[last] += ` ${trimmed}`;
      }
    }
  }

  return versions;
}

function splitVersion(v: string): { nums: number[]; pre: string[] } {
  let s = v.trim();
  if (s.startsWith("v")) s = s.slice(1);
  const dash = s.indexOf("-");
  const core = dash === -1 ? s : s.slice(0, dash);
  const pre = dash === -1 ? [] : s.slice(dash + 1).split(".");
  const nums = core.split(".").map((n) => {
    const parsed = parseInt(n, 10);
    return Number.isNaN(parsed) ? 0 : parsed;
  });
  return { nums, pre };
}

function comparePrerelease(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 0;
  if (a.length === 0) return 1;
  if (b.length === 0) return -1;
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const x = a[i] ?? "";
    const y = b[i] ?? "";
    if (x === y) continue;
    const xn = /^\d+$/.test(x);
    const yn = /^\d+$/.test(y);
    if (xn && yn) return parseInt(x, 10) - parseInt(y, 10);
    if (xn) return -1;
    if (yn) return 1;
    return x < y ? -1 : 1;
  }
  return 0;
}

export function compareVersions(a: string, b: string): number {
  const pa = splitVersion(a);
  const pb = splitVersion(b);
  const len = Math.max(pa.nums.length, pb.nums.length);
  for (let i = 0; i < len; i++) {
    const x = pa.nums[i] ?? 0;
    const y = pb.nums[i] ?? 0;
    if (x !== y) return x - y;
  }
  return comparePrerelease(pa.pre, pb.pre);
}

async function fetchText(url: string, headers: Record<string, string> = {}, timeoutMs = 8000): Promise<string> {
  const MAX_BODY_BYTES = 2 * 1024 * 1024;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers, signal: controller.signal, redirect: "follow" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const contentLength = res.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > MAX_BODY_BYTES) {
      throw new Error("Changelog too large");
    }
    const reader = res.body?.getReader();
    if (!reader) throw new Error("No response body");
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.length;
      if (totalBytes > MAX_BODY_BYTES) {
        reader.cancel();
        throw new Error("Changelog too large");
      }
      chunks.push(value);
    }
    const text = new TextDecoder().decode(new Uint8Array(chunks.flatMap((c) => [...c])));
    if (text.trim().length < 50) throw new Error("Empty changelog");
    return text;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchChangelogText(owner: string, repo: string): Promise<{ text: string; source: string }> {
  const sources: { name: string; url: string; headers: Record<string, string> }[] = [
    {
      name: "github-raw",
      url: `https://raw.githubusercontent.com/${owner}/${repo}/main/CHANGELOG.md`,
      headers: {},
    },
    {
      name: "github-raw",
      url: `https://raw.githubusercontent.com/${owner}/${repo}/master/CHANGELOG.md`,
      headers: {},
    },
    {
      name: "github-api",
      url: `https://api.github.com/repos/${owner}/${repo}/contents/CHANGELOG.md`,
      headers: {
        Accept: "application/vnd.github.raw+json",
        "User-Agent": "BioPlatform-version-check",
      },
    },
    {
      name: "jsdelivr",
      url: `https://cdn.jsdelivr.net/gh/${owner}/${repo}@main/CHANGELOG.md`,
      headers: {},
    },
    {
      name: "jsdelivr",
      url: `https://cdn.jsdelivr.net/gh/${owner}/${repo}@master/CHANGELOG.md`,
      headers: {},
    },
  ];

  for (const source of sources) {
    try {
      const text = await fetchText(source.url, source.headers);
      return { text, source: source.name };
    } catch {
      // try next source
    }
  }

  throw new Error("Could not fetch the changelog from any source");
}

function computeSeverity(
  installed: string,
  versions: ChangelogVersion[],
  threshold: number
): { outdated: boolean; latest: string | null; skipped: ChangelogVersion[]; severity: UpdateSeverity } {
  if (versions.length === 0) {
    return { outdated: false, latest: null, skipped: [], severity: "none" };
  }

  const latest = versions[0].version;

  if (installed === "unknown") {
    return { outdated: true, latest, skipped: versions, severity: "update" };
  }

  if (compareVersions(installed, latest) >= 0) {
    return { outdated: false, latest, skipped: [], severity: "none" };
  }

  const skipped = versions.filter((v) => compareVersions(v.version, installed) > 0);
  const oldest = versions[versions.length - 1];
  const installedKnown = versions.some((v) => compareVersions(v.version, installed) === 0);
  const ancient = !installedKnown && compareVersions(installed, oldest.version) < 0;
  const hasSecurity = skipped.some(
    (v) => v.sections.some((s) => /security|critical/i.test(s.heading) && s.items.length > 0)
  );

  let severity: UpdateSeverity = "update";
  if (hasSecurity && (ancient || skipped.length >= threshold)) {
    severity = "critical";
  } else if (hasSecurity) {
    severity = "security";
  } else if (ancient || skipped.length >= threshold) {
    severity = "critical";
  }

  return { outdated: true, latest, skipped, severity };
}

function buildData(input: {
  installed: string;
  versions: ChangelogVersion[];
  severity: UpdateSeverity;
  outdated: boolean;
  latest: string | null;
  skipped: ChangelogVersion[];
  source: string;
  checkedAt: string;
  error?: string;
}): VersionCheckData {
  const url = repoUrl();
  const tag = input.latest ? `v${input.latest.replace(/^v/, "")}` : null;
  return {
    enabled: getEnv().UPDATE_CHECK_ENABLED,
    installed: input.installed,
    latest: input.latest,
    outdated: input.outdated,
    severity: input.severity,
    skippedVersions: input.skipped,
    skippedCount: input.skipped.length,
    releaseUrl: tag ? `${url}/releases/tag/${tag}` : `${url}/releases`,
    releasesUrl: `${url}/releases`,
    changelogUrl: `${url}/blob/main/CHANGELOG.md`,
    checkedAt: input.checkedAt,
    source: input.source,
    error: input.error,
  };
}

interface CacheEntry {
  data: VersionCheckData;
  fetchedAt: number;
  lastGood: VersionCheckData | null;
  lastGoodAt: number | null;
}

let cache: CacheEntry | null = null;
let inflight: Promise<VersionCheckData> | null = null;

export async function getVersionCheck(force = false): Promise<VersionCheckData> {
  const env = getEnv();
  const installed = getInstalledVersion();

  if (!env.UPDATE_CHECK_ENABLED) {
    return buildData({
      installed,
      versions: [],
      severity: "none",
      outdated: false,
      latest: null,
      skipped: [],
      source: "none",
      checkedAt: new Date().toISOString(),
      error: "disabled",
    });
  }

  const now = Date.now();
  const intervalMs = env.UPDATE_CHECK_INTERVAL_MINUTES * 60 * 1000;

  if (!force && cache && now - cache.fetchedAt < intervalMs) {
    return cache.data;
  }

  if (inflight) return inflight;

  inflight = (async () => {
    const startedAt = Date.now();
    try {
      const { owner, repo } = parseRepo(repoUrl());
      const { text, source } = await fetchChangelogText(owner, repo);
      const versions = parseChangelog(text);
      const computed = computeSeverity(installed, versions, env.UPDATE_CRITICAL_STALE_THRESHOLD);
      const data = buildData({
        installed,
        versions,
        severity: computed.severity,
        outdated: computed.outdated,
        latest: computed.latest,
        skipped: computed.skipped,
        source,
        checkedAt: new Date().toISOString(),
      });
      cache = { data, fetchedAt: Date.now(), lastGood: data, lastGoodAt: Date.now() };
      return data;
    } catch (err) {
      const error = err instanceof Error ? err.message : "Unknown error";
      const staleMaxMs = env.UPDATE_CHECK_STALE_MAX_MINUTES * 60 * 1000;
      if (cache?.lastGood && cache.lastGoodAt && startedAt - cache.lastGoodAt < staleMaxMs) {
        const data: VersionCheckData = {
          ...cache.lastGood,
          checkedAt: new Date().toISOString(),
          source: "cache",
          error: "cached",
        };
        cache = { data, fetchedAt: Date.now(), lastGood: cache.lastGood, lastGoodAt: cache.lastGoodAt };
        return data;
      }
      const data = buildData({
        installed,
        versions: [],
        severity: "none",
        outdated: false,
        latest: null,
        skipped: [],
        source: "none",
        checkedAt: new Date().toISOString(),
        error,
      });
      cache = { data, fetchedAt: Date.now(), lastGood: null, lastGoodAt: null };
      return data;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

export function startUpdateChecker(): void {
  const env = getEnv();
  if (!env.UPDATE_CHECK_ENABLED) return;
  const intervalMs = env.UPDATE_CHECK_INTERVAL_MINUTES * 60 * 1000;
  void getVersionCheck(true).catch(() => {});
  const timer = setInterval(() => {
    void getVersionCheck(true).catch(() => {});
  }, intervalMs);
  timer.unref?.();
}

export function getLockdownState(): {
  locked: boolean;
  severity: UpdateSeverity;
  latest: string | null;
} {
  const env = getEnv();
  if (!env.UPDATE_CHECK_ENABLED) {
    return { locked: false, severity: "none", latest: null };
  }
  if (!cache) {
    void getVersionCheck().catch(() => {});
    return { locked: false, severity: "none", latest: null };
  }
  const sev = cache.data.severity;
  return {
    locked: sev === "security" || sev === "critical",
    severity: sev,
    latest: cache.data.latest,
  };
}

export function requireNoUpdateLockdown(_req: unknown, res: { status(code: number): { json(body: unknown): void } }, next: () => void): void {
  const state = getLockdownState();
  if (state.locked) {
    res.status(403).json({
      success: false,
      error: LOCKDOWN_MESSAGE,
      updateRequired: true,
      severity: state.severity,
      latest: state.latest,
    });
    return;
  }
  next();
}

export const UPDATE_LOCKDOWN_MESSAGE = LOCKDOWN_MESSAGE;
