// Third-party ad-network registry for instance-owner ads (FOLLOW-UP 3).
//
// The instance operator configures ads in config.yml (`public.ads` + the
// never-serialized `private.ads`), and this module is the single registry that
// knows WHICH networks exist, WHAT kind of placement they produce (banner vs
// pop-under), and WHICH hosts their loaders/creative fetch from. Everything the
// frontend renders is derived from here, and the per-network CSP host lists are
// the same ones nginx/site.conf appends when a network is enabled.
//
// Two embed strategies are supported (see the docs / config.yml.example):
//   * canonical  — the frontend builds the embed itself from typed params:
//       - AdSense:   <ins class="adsbygoogle"> + the adsbygoogle loader
//                    (manual slot) or the auto-ads global script.
//       - anything  a plain <script src="…"> where the scrutinized host is one
//       else:        of that network's registry scriptHosts + an optional
//                    token appended as a query param.
//   * raw        — the operator pastes their network's official snippet and it
//                  is rendered verbatim inside the ad slot ONLY. This is the
//                  one part of config.yml that is deliberately NOT sanitized
//                  (a comparison to an operator pasting into their own nginx),
//                  it is gated behind an explicit `network: raw` choice, and it
//                  must never carry secrets — the snippet reaches the browser.

export const AD_NETWORKS = [
  "adsense",
  "adsterra",
  "aads",
  "popads",
  "propellerads",
  "hilltopads",
  "medianet",
  "infolinks",
] as const;

export type AdNetworkId = (typeof AD_NETWORKS)[number];

export interface AdNetworkDefinition {
  id: AdNetworkId;
  label: string;
  kind: "banner" | "popunder";
  /** Hosts whose scripts this network may ask the browser to execute. */
  scriptHosts: string[];
  /** Hosts the network draws images/frames from (CSP img-src / frame-src). */
  imageHosts: string[];
  /** Hosts the network's JS talks back to (CSP connect-src). */
  connectHosts: string[];
  /**
   * Canonical loader template for the plain `<script src>` strategy. `{token}`
   * is replaced with the operator's `params.script.token` when present.
   * AdSense is the exception: it is embedded by building the <ins> element, not
   * through this template (see apps/frontend/src/components/ads/adEmbeds.ts).
   */
  scriptsrcTemplate: string | null;
}

/**
 * Full registry. Host lists are best-effort constants — double-check the
 * network's loader/creative docs when adding or extending a network, and keep
 * them in sync with the corresponding CSP block in nginx/site.conf.
 */
export const AD_NETWORKS_REGISTRY: readonly AdNetworkDefinition[] = [
  {
    id: "adsense",
    label: "Google AdSense",
    kind: "banner",
    scriptHosts: [
      "pagead2.googlesyndication.com",
      "googlesyndication.com",
      "googleads.g.doubleclick.net",
    ],
    imageHosts: [
      "pagead2.googlesyndication.com",
      "googlesyndication.com",
      "googleads.g.doubleclick.net",
      "tpc.googlesyndication.com",
      "gstatic.com",
    ],
    connectHosts: [
      "googlesyndication.com",
      "securepubads.g.doubleclick.net",
      "doubleclick.net",
    ],
    scriptsrcTemplate: null,
  },
  {
    id: "adsterra",
    label: "Adsterra",
    kind: "banner",
    scriptHosts: [
      "a.magsrv.com",
      "www.highperformanceformat.com",
      "adsterra.com",
      "www.adsterra.com",
    ],
    imageHosts: ["a.magsrv.com", "staticdns.com", "adsterra.com"],
    connectHosts: ["magsrv.com", "adsterra.com"],
    scriptsrcTemplate: "https://{host}/ad.js?cb={token}",
  },
  {
    id: "aads",
    label: "AADS (BTC-only)",
    kind: "banner",
    scriptHosts: ["aads.com", "www.aads.com"],
    imageHosts: ["aads.com", "www.aads.com"],
    connectHosts: ["aads.com", "www.aads.com"],
    scriptsrcTemplate: "https://{host}/js/{token}",
  },
  {
    id: "popads",
    label: "PopAds",
    kind: "popunder",
    scriptHosts: ["popads.net", "www.popads.net"],
    imageHosts: [],
    connectHosts: ["popads.net"],
    scriptsrcTemplate: "https://{host}/pop.js?{token}",
  },
  {
    id: "propellerads",
    label: "PropellerAds",
    kind: "popunder",
    scriptHosts: ["pushpropellerads.com", "propellerads.com"],
    imageHosts: ["pushpropellerads.com", "propellerads.com"],
    connectHosts: ["propellerads.com"],
    scriptsrcTemplate: "https://{host}/{token}",
  },
  {
    id: "hilltopads",
    label: "HilltopAds",
    kind: "banner",
    scriptHosts: ["hilltopads.net", "www.hilltopads.net"],
    imageHosts: ["hilltopads.net", "www.hilltopads.net"],
    connectHosts: ["hilltopads.net"],
    scriptsrcTemplate: "https://{host}/{token}",
  },
  {
    id: "medianet",
    label: "Media.net",
    kind: "banner",
    scriptHosts: ["contextual.media.net"],
    imageHosts: ["contextual.media.net", "media.net"],
    connectHosts: ["media.net"],
    scriptsrcTemplate: "https://{host}/{token}",
  },
  {
    id: "infolinks",
    label: "Infolinks",
    kind: "banner",
    scriptHosts: ["infolinks.com", "www.infolinks.com"],
    imageHosts: ["infolinks.com", "www.infolinks.com"],
    connectHosts: ["infolinks.com"],
    scriptsrcTemplate: "https://{host}/{token}",
  },
];

export const AD_NETWORK_BY_ID: ReadonlyMap<AdNetworkId, AdNetworkDefinition> =
  new Map(AD_NETWORKS_REGISTRY.map((n) => [n.id, n]));

/** True when the network produces a pop-under instead of an in-page banner. */
export function isPopUnderNetwork(network: AdNetworkId): boolean {
  return AD_NETWORK_BY_ID.get(network)?.kind === "popunder";
}

/** All hosts, deduplicated, that the network may need from the browser. */
export function adNetworkCspHosts(network: AdNetworkId): string[] {
  const def = AD_NETWORK_BY_ID.get(network);
  if (!def) return [];
  return Array.from(new Set([...def.scriptHosts, ...def.imageHosts, ...def.connectHosts]));
}

/**
 * Resolve the canonical script-src embed URL for a script-based network.
 * Returns null when the network has no template, the operator supplied no src,
 * or the given src is not on one of the network's own script hosts (the
 * allowlist guard that stops an arbitrary exfil/tracking host sneaking in).
 */
export function resolveAdScriptSrc(
  network: AdNetworkId,
  src: string,
  token: string
): string | null {
  const def = AD_NETWORK_BY_ID.get(network);
  if (!def || !def.scriptsrcTemplate) return null;
  const trimmed = src.trim();
  if (!trimmed) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const host = url.hostname.toLowerCase();
  const allowed = def.scriptHosts.some((h) => host === h || host.endsWith(`.${h}`));
  if (!allowed) return null;
  // {token} token substitution — never URL-unescapable content, just a token.
  return def.scriptsrcTemplate
    .replace("{host}", host)
    .replace("{token}", encodeURIComponent(token || ""));
}