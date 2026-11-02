// Generated Content-Security-Policy for the nginx layer (ADS-FIX 2026-11).
//
// Problem this solves: nginx/site.conf carried a hand-maintained CSP that is a
// STATIC SUPER-SET of every ad network's hosts. That has two failure modes:
//   * ads disabled → the browser still sees 20+ ad hosts in `script-src` etc.
//     (any console CSP error therefore *mentions* ads even when no ad code
//     ever runs, which looks like "ads are being requested behind our back"), and
//   * `network: raw` snippets (operator HTML with inline <script> bodies) are
//     rejected outright, because a host allowlist never permits inline code —
//     CSP needs per-script SHA-256 hashes for those.
//
// This module is the single source of truth:
//   * static feature hosts (media embeds, fonts, profile images) stay listed,
//   * ad-network hosts are appended ONLY for the networks actually configured
//     in config.yml (`public.ads.slots`), taken from the `ads.ts` registry,
//   * `network: raw` slots contribute SHA-256 hashes for every inline <script>
//     body the snippet carries, so the exact snippet runs and nothing else does.
//
// The header line is written to the SHARED certs volume (already bind-mounted
// into the nginx container), and nginx/entrypoint.sh watches the file and
// reloads nginx automatically — see `writeNginxCspConf`. Changing ads in
// config.yml therefore re-syncs the CSP end to end without a manual edit to
// nginx/site.conf.

import { createHash } from "crypto";
import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { getEnv } from "../config/env.js";
import { AD_NETWORKS_REGISTRY, type AdNetworkId } from "./ads.js";

/** Only the fields csp.ts may read — `private` never flows through here. */
export interface CspAdsConfig {
  enabled: boolean;
  slots: Array<{ network: string; params: { raw?: string } }>;
}

/** Non-ad feature hosts (media players, fonts, profile images, CF challenge). */
const SCRIPT_SRC_FEATURE = [
  "'self'",
  "https://www.youtube.com",
  "https://static.cloudflareinsights.com",
  "https://challenges.cloudflare.com",
];
const IMG_SRC_FEATURE = [
  "'self'",
  "data:",
  "blob:",
  "https://cdn.discordapp.com",
  "https://i.scdn.co",
  "https://gstatic.com",
];
const FRAME_SRC_FEATURE = [
  "https://www.youtube-nocookie.com",
  "https://www.youtube.com",
  "https://open.spotify.com",
  "https://challenges.cloudflare.com",
];
const CONNECT_SRC_FEATURE = [
  "'self'",
  "https://www.youtube.com",
  "https://www.youtube-nocookie.com",
  "https://cloudflareinsights.com",
  "https://challenges.cloudflare.com",
];

/**
 * Expand a registry host into its https:// bare form AND its www. form. Ad
 * loaders bounce between bare and www hosts (Adsterra even documents both), and
 * a missing variant silently kills the placement, so both are always included.
 */
function httpsHosts(hosts: string[]): string[] {
  const out = new Set<string>();
  for (const host of hosts) {
    out.add(`https://${host}`);
    out.add(`https://www.${host}`);
  }
  return [...out];
}

/**
 * SHA-256 hashes (CSP `sha256-…`, base64) of every inline <script> body inside
 * an operator raw snippet. Browsers hash the EXACT byte range between the script
 * tags, so the bodies are extracted verbatim — no trimming, no entity decoding.
 * The frontend's `injectRawSnippet` re-writes each script verbatim, so hashes
 * computed here match what the browser sees.
 */
export function rawSnippetInlineHashes(html: string): string[] {
  const hashes: string[] = [];
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const opening = match[1] ?? "";
    if (/\bsrc\s*=/.test(opening)) continue; // external scripts match the host list instead
    const body = match[2];
    // An empty inline body hashes to a constant — and blocks nothing. Skip.
    if (!body.trim()) continue;
    hashes.push(`'sha256-${createHash("sha256").update(Buffer.from(body, "utf8")).digest("base64")}'`);
  }
  return hashes;
}

/** True when the network id is one of the known AD_NETWORKS registry ids. */
function isKnownNetwork(network: string): network is AdNetworkId {
  return AD_NETWORKS_REGISTRY.some((def) => def.id === network);
}

/**
 * Build the whole CSP header value.
 * `ads.enabled === false` → zero ad-network hosts anywhere (the console can no
 * longer even name ads). Enabled → strictly the hosts of the CONFIGURED
 * networks, in the directive where the registry says they're needed.
 */
export function buildCspHeader(ads: CspAdsConfig | null | undefined): string {
  const enabledSlots = ads?.enabled
    ? (ads.slots ?? []).filter((slot) => slot?.network)
    : [];

  const scriptSrc = new Set<string>(SCRIPT_SRC_FEATURE);
  const imgSrc = new Set<string>(IMG_SRC_FEATURE);
  const frameSrc = new Set<string>(FRAME_SRC_FEATURE);
  const connectSrc = new Set<string>(CONNECT_SRC_FEATURE);

  // Inline snippets: hash-pin every inline script body of every raw slot (raw
  // is an operator-paste, not a registry network — hosts come from the snippet
  // itself, so only inline bodies are policy-managed here).
  const inlineHashes = new Set<string>();
  for (const slot of enabledSlots) {
    const raw = slot.params?.raw?.trim();
    if (!raw) continue;
    for (const hash of rawSnippetInlineHashes(raw)) inlineHashes.add(hash);
    // External script srcs referenced by the snippet itself. Only the hosts
    // the snippet actually loads are added — the config explicitly owns this
    // trust decision (raw is the documented unsanitized operator channel).
    for (const match of raw.matchAll(/<script\b[^>]*\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'`<>]+))/gi)) {
      const value = match[1] ?? match[2] ?? match[3];
      if (!value || !value.trim()) continue;
      try {
        // Snippets classically use protocol-relative srcs (`//host/path`).
        // Those resolve to https on our https-only pages. Bare-relative srcs
        // (`/x.js`) stay inside 'self' — never turn them into an added host.
        const trimmedValue = value.trim();
        if (!trimmedValue.startsWith("//")) continue;
        const url = new URL(`https:${trimmedValue}`);
        if (url.protocol === "https:") scriptSrc.add(`https://${url.hostname.toLowerCase()}`);
      } catch {
        // Relative or malformed src — ignore: it can only resolve within our
        // own origin, which script-src already allows via 'self'.
      }
    }
  }

  for (const slot of enabledSlots) {
    if (!isKnownNetwork(slot.network)) continue;
    const def = AD_NETWORKS_REGISTRY.find((n) => n.id === slot.network)!;
    for (const host of httpsHosts(def.scriptHosts)) scriptSrc.add(host);
    for (const host of httpsHosts(def.imageHosts)) imgSrc.add(host);
    for (const host of httpsHosts(def.connectHosts)) connectSrc.add(host);
    // Banner networks render creatives inside iframes sourced from their own
    // hosts; pop-under snippets only run scripts.
    for (const host of httpsHosts(def.imageHosts)) frameSrc.add(host);
  }

  const parts: string[] = [
    `default-src 'self'`,
    `script-src ${[...scriptSrc, ...inlineHashes].join(" ")}`,
    `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
    `font-src 'self' https://fonts.gstatic.com data:`,
    `img-src ${[...imgSrc].join(" ")}`,
    `media-src 'self' blob:`,
    `frame-src ${[...frameSrc].join(" ")}`,
    `connect-src ${[...connectSrc].join(" ")}`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `frame-ancestors 'self'`,
    `form-action 'self'`,
  ];
  return parts.join("; ");
}

/** The single nginx directive, ready to drop into an include file. */
export function renderNginxCspConf(csp: string): string {
  const escaped = csp.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return (
    "# GENERATED by the backend (bioplatform cli csp / instance config watch) from config.yml.\n" +
    "# DO NOT hand-edit — the next config reload overwrites it. Ad hosts appear here\n" +
    "# ONLY while ads are enabled; `network: raw` snippets are hash-pinned.\n" +
    `add_header Content-Security-Policy "${escaped}" always;\n`
  );
}

/** The shared certs volume path that the nginx container also bind-mounts. */
function nginxCspPath(): string {
  return path.join(getEnv().ACME_CERTS_PATH, "csp.conf");
}

/**
 * Write the include file atomically (tmp + rename so nginx/entrypoint.sh never
 * reads a half-written file). The entrypoint's reload watcher re-tests the
 * config (`nginx -t`) before reloading, so a malformed write aborts harmlessly.
 */
export function writeNginxCspConf(csp: string): { path: string; bytes: number } {
  const target = nginxCspPath();
  mkdirSync(path.dirname(target), { recursive: true });
  const tmp = `${target}.tmp`;
  const content = renderNginxCspConf(csp);
  writeFileSync(tmp, content, "utf8");
  renameSync(tmp, target);
  return { path: target, bytes: Buffer.byteLength(content, "utf8") };
}

/**
 * Fire-and-forget sync used by instanceConfig load/reload. Never throws: the
 * file is an operational nicety; a broken certs mount must not take the API
 * down over a header.
 */
export function syncNginxCsp(ads: CspAdsConfig | null | undefined): void {
  try {
    const result = writeNginxCspConf(buildCspHeader(ads));
    console.log(`CSP header synced to ${result.path} (${result.bytes} bytes)`);
  } catch (error) {
    console.error("CSP header sync failed (nginx keeps serving the previous header):", error);
  }
}
