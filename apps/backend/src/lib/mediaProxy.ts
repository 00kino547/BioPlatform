import crypto from "crypto";
import dns from "dns/promises";
import fs from "fs";
import https from "https";
import net from "net";
import path from "path";
import type { LookupAddress } from "node:dns";
import type { NextFunction, Request, Response } from "express";
import { getEnv } from "../config/env.js";

const MONTH = 30 * 24 * 60 * 60;
const MAX_REDIRECTS = 4;
const PROXY_FETCH_TIMEOUT_MS = 15_000;
const PROXY_CACHE_SUBDIR = "proxy";
const PROXY_CACHE_MAX_FILES = 2000;

const ALLOWED_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/avif",
  "image/bmp",
]);

const MAGIC_BYTES: Array<{ content: string; prefix: Buffer }> = [
  { content: "image/jpeg", prefix: Buffer.from([0xff, 0xd8, 0xff]) },
  { content: "image/png", prefix: Buffer.from([0x89, 0x50, 0x4e, 0x47]) },
  { content: "image/gif", prefix: Buffer.from([0x47, 0x49, 0x46, 0x38]) },
  { content: "image/webp", prefix: Buffer.from([0x52, 0x49, 0x46, 0x46]) },
  { content: "image/avif", prefix: Buffer.from([0x00, 0x00, 0x00]) },
  { content: "image/bmp", prefix: Buffer.from([0x42, 0x4d]) },
];

export function isPrivateIp(ip: string): boolean {
  if (!net.isIP(ip)) return true;
  if (ip.includes(":")) {
    const normalized = ip.toLowerCase();
    if (normalized === "::" || normalized === "::1") return true;
    const compatDot = normalized.match(/([0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3})$/);
    if (compatDot) {
      const head = normalized.slice(0, normalized.length - compatDot[1].length);
      if (/^:+(?:0+:)*$/.test(head) || /^0:+(?:0+:)*$/.test(head)) return isPrivateIp(compatDot[1]);
    }
    const mIdx = normalized.lastIndexOf("ffff:");
    if (mIdx >= 0) {
      const prefix = normalized.slice(0, mIdx);
      if (prefix.split(":").filter(Boolean).every((s) => s === "0" || s === "")) {
        const tail = normalized.slice(mIdx + 5);
        if (tail.includes(".")) return isPrivateIp(tail);
        const groups = tail.split(":");
        const bytes: number[] = [];
        for (const group of groups) {
          const hex = group.padStart(4, "0");
          const hi = parseInt(hex.slice(0, 2), 16);
          const lo = parseInt(hex.slice(2, 4), 16);
          if (Number.isNaN(hi) || Number.isNaN(lo)) break;
          bytes.push(hi, lo);
        }
        if (bytes.length === 4) return isPrivateIp(bytes.join("."));
        return true;
      }
    }
    if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
    // Link-local unicast is fe80::/10, i.e. fe80–febf. fe8* alone misses fe9*/fea*/feb*.
    if (normalized.startsWith("fe8") || normalized.startsWith("fe9") || normalized.startsWith("fea") || normalized.startsWith("feb")) return true;
    if (normalized.startsWith("ff")) return true;
    return false;
  }
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4) return true;
  const [a, b] = parts;
  if (a === 0 || a === 10) return true;
  if (a === 127) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  // Documentation / reserved ranges (192.0.0.0/24, 192.0.2.0/24, 198.51.100.0/24, 203.0.113.0/24).
  if (
    (a === 192 && b === 0 && (parts[2] === 0 || parts[2] === 2)) ||
    (a === 198 && b === 51 && parts[2] === 100) ||
    (a === 203 && b === 0 && parts[2] === 113)
  ) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a >= 224) return true;
  return false;
}

export async function hostnameSafe(hostname: string): Promise<boolean> {
  return (await resolvePublicAddresses(hostname)) !== null;
}

/**
 * Resolve a hostname and keep ONLY public (non-private) addresses.
 *
 * The critical SSRF defense: we resolve once, filter out anything private, and
 * dial the validated address directly. Without this, there is a classic DNS
 * rebinding (TOCTOU) race — the validation lookup and the later socket
 * connection resolve independently, so an attacker could return a public IP
 * for validation and a private one (e.g. 169.254.169.254) for the actual
 * connection.
 */
async function resolvePublicAddresses(hostname: string): Promise<string[] | null> {
  const clean = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (net.isIP(clean)) return isPrivateIp(clean) ? null : [clean];
  if (clean === "localhost" || clean.endsWith(".localhost")) return null;
  let records: LookupAddress[];
  try {
    records = await dns.lookup(clean, { all: true });
  } catch {
    return null;
  }
  const publics = records.filter((r) => !isPrivateIp(r.address)).map((r) => r.address);
  return publics.length > 0 ? publics : null;
}

async function fetchSingle(url: string): Promise<{ ok: boolean; status?: number; contentType?: string; data?: Buffer; redirect?: string; error?: string }> {  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, error: "invalid-url" };
  }
  if (parsed.protocol !== "https:") return { ok: false, error: "https-only" };
  const addresses = await resolvePublicAddresses(parsed.hostname);
  if (!addresses) return { ok: false, error: "blocked-host" };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROXY_FETCH_TIMEOUT_MS);
  const maxBytes = getEnv().MEDIA_PROXY_MAX_BYTES;
  try {
    // Try each validated public address until one connects.
    let lastError: unknown;
    for (const address of addresses) {
      try {
        return await requestPinned(parsed, address, { signal: controller.signal, maxBytes });
      } catch (error) {
        lastError = error;
        if (controller.signal.aborted) break;
      }
    }
    void lastError;
    return { ok: false, error: "fetch-failed" };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Issue a single HTTPS GET that dials `address` (already validated public and
 * owned by the target hostname). TLS SNI + hostname verification still happen
 * against the original hostname so the certificate check stays correct.
 */
function requestPinned(
  parsed: URL,
  address: string,
  opts: { signal: AbortSignal; maxBytes: number }
): Promise<{ ok: boolean; status?: number; contentType?: string; data?: Buffer; redirect?: string; error?: string }> {
  return new Promise((resolve, reject) => {
    const hostname = parsed.hostname;
    const req = https.request({
      method: "GET",
      protocol: "https:",
      hostname: address,
      port: parsed.port || 443,
      path: `${parsed.pathname}${parsed.search}`,
      // SNI + certificate hostname; undefined for literal-IP requests so the
      // cert check falls back to the IP itself.
      servername: net.isIP(hostname) ? undefined : hostname,
      headers: {
        "user-agent": "BioPlatform-MediaProxy/1.0",
        accept: "image/*,",
        Host: parsed.host,
      },
      signal: opts.signal,
    });

    req.on("error", (error) => {
      if (opts.signal.aborted) {
        resolve({ ok: false, error: "fetch-failed" });
        return;
      }
      reject(error);
    });

    req.on("response", (res) => {
      const status = res.statusCode ?? 0;
      if (status >= 300 && status < 400) {
        const location = res.headers.location;
        res.resume();
        resolve({ ok: true, status, redirect: location ?? undefined });
        return;
      }
      if (status < 200 || status >= 400) {
        res.resume();
        resolve({ ok: false, status, error: "upstream-error" });
        return;
      }
      const contentType = (res.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
      if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
        res.resume();
        resolve({ ok: false, status, error: "content-type-not-allowed" });
        return;
      }

      const chunks: Buffer[] = [];
      let total = 0;
      res.on("data", (chunk: Buffer) => {
        total += chunk.length;
        if (total > opts.maxBytes) {
          res.destroy();
          resolve({ ok: false, status, error: "too-large" });
          return;
        }
        chunks.push(chunk);
      });
      res.on("end", () => {
        const data = Buffer.concat(chunks);
        if (data.length === 0) {
          resolve({ ok: false, status, error: "empty-body" });
          return;
        }
        resolve({ ok: true, status, contentType, data });
      });
    });

    req.end();
  });
}

function magicMatches(data: Buffer, declared: string): boolean {
  for (const m of MAGIC_BYTES) {
    if (m.content === declared) {
      return data.length >= m.prefix.length && data.subarray(0, m.prefix.length).equals(m.prefix);
    }
  }
  return false;
}

export async function proxyExternalImage(req: Request, res: Response, next: NextFunction): Promise<void | Response> {
  if (!getEnv().MEDIA_PROXY_ENABLED) return next();
  const raw = req.query.url;
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 4096) {
    return res.status(400).json({ success: false, error: "media_proxy:missing-url" });
  }
  let targetUrl: string;
  try {
    targetUrl = decodeURIComponent(raw);
    const u = new URL(targetUrl);
    if (u.protocol !== "https:") {
      return res.status(403).json({ success: false, error: "media_proxy:https-only" });
    }
  } catch {
    return res.status(400).json({ success: false, error: "media_proxy:invalid-url" });
  }

  const cacheKey = crypto.createHash("sha256").update(targetUrl).digest("hex");
  const env = getEnv();
  const cacheDir = path.join(path.resolve(env.LOCAL_STORAGE_PATH), ".media-cache", PROXY_CACHE_SUBDIR);
  const cacheFile = path.join(cacheDir, `${cacheKey}.img`);
  const ttlMs = env.MEDIA_PROXY_TTL_HOURS * 3600 * 1000;

  const cached = await fs.promises.stat(cacheFile).catch(() => null);
  if (cached?.isFile() && Date.now() - cached.mtimeMs < ttlMs) {
    const buf = await fs.promises.readFile(cacheFile).catch(() => null);
    if (buf) {
      const ct = peekContentType(buf);
      if (ct) return sendImage(res, buf, ct);
    }
  }

  let current = targetUrl;
  let result: Awaited<ReturnType<typeof fetchSingle>> = { ok: false };
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    result = await fetchSingle(current);
    if (!result.ok) break;
    if (result.redirect) {
      let nextUrl: URL;
      try {
        nextUrl = new URL(result.redirect, current);
      } catch {
        result = { ok: false, error: "bad-redirect" };
        break;
      }
      if (nextUrl.protocol !== "https:") {
        result = { ok: false, error: "https-only" };
        break;
      }
      if (!(await hostnameSafe(nextUrl.hostname))) {
        result = { ok: false, error: "blocked-host" };
        break;
      }
      current = nextUrl.toString();
      continue;
    }
    break;
  }

  if (!result.ok || !result.data) {
    return res.status(502).json({ success: false, error: `media_proxy:${result.error ?? "unknown"}` });
  }

  const contentType = result.contentType ?? peekContentType(result.data);
  if (!contentType || !magicMatches(result.data, contentType)) {
    return res.status(415).json({ success: false, error: "media_proxy:unsupported-image" });
  }

  await fs.promises.mkdir(cacheDir, { recursive: true }).catch(() => undefined);
  await fs.promises.writeFile(cacheFile, result.data).catch(() => undefined);
  void pruneProxyCache(cacheDir);
  sendImage(res, result.data, contentType);
}

function peekContentType(data: Buffer): string | null {
  if (data.length >= 3 && data.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return "image/jpeg";
  if (data.length >= 4 && data.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))) return "image/png";
  if (data.length >= 3 && data.subarray(0, 3).equals(Buffer.from([0x47, 0x49, 0x46]))) return "image/gif";
  if (data.length >= 4 && data.subarray(0, 4).equals(Buffer.from([0x52, 0x49, 0x46, 0x46]))) return "image/webp";
  if (data.length >= 2 && data.subarray(0, 2).equals(Buffer.from([0x42, 0x4d]))) return "image/bmp";
  if (data.length >= 12 && data.subarray(4, 9).toString() === "ftyp") return "image/avif";
  return null;
}

function sendImage(res: Response, data: Buffer, contentType: string) {
  res.setHeader("Content-Type", contentType);
  res.setHeader("Cache-Control", `public, max-age=${MONTH}, immutable`);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
  res.setHeader("Cross-Origin-Resource-Policy", "same-site");
  res.send(data);
}

async function pruneProxyCache(cacheDir: string): Promise<void> {
  let entries: fs.Dirent[];
  try {
    entries = await fs.promises.readdir(cacheDir, { withFileTypes: true });
  } catch {
    return;
  }
  if (entries.length <= PROXY_CACHE_MAX_FILES) return;
  const ttlMs = getEnv().MEDIA_PROXY_TTL_HOURS * 3600 * 1000;
  const now = Date.now();
  const list: Array<{ name: string; mtimeMs: number }> = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const abs = path.join(cacheDir, entry.name);
    const stat = await fs.promises.stat(abs).catch(() => null);
    if (!stat || !stat.isFile()) continue;
    list.push({ name: entry.name, mtimeMs: stat.mtimeMs });
  }
  list.sort((a, b) => a.mtimeMs - b.mtimeMs);
  const keep = Math.floor(PROXY_CACHE_MAX_FILES * 0.8);
  const removeCount = Math.max(0, list.length - keep);
  for (let i = 0; i < list.length; i++) {
    const item = list[i];
    const shouldRemove = i < removeCount || now - item.mtimeMs > ttlMs;
    if (shouldRemove) {
      await fs.promises.unlink(path.join(cacheDir, item.name)).catch(() => undefined);
    }
  }
}
