// Client-side mounters for the instance ad slots (FOLLOW-UP 3).
//
// Security posture: every `script.src` a slot can produce was validated at
// config.yml load time against the network allowlist in
// `apps/backend/src/lib/ads.ts`. These helpers only ever reach the networks the
// operator configured, plus the AdSense loader we build ourselves. The raw
// snippet mode (`network: "raw"`) is the operator's own HTML — it is injected
// verbatim as the deliberate, documented exception to the string sanitizer and
// the "no dangerouslySetInnerHTML" rule, rendered via plain DOM APIs instead.

import type { InstanceAdSlot } from "@/lib/api";

/** Canonical AdSense loader URL. */
const ADSENSE_LOADER = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js";

/** Networks that open a new browsing context the moment their loader runs. */
const POPUNDER_NETWORKS = new Set(["popads", "propellerads"]);

/** sessionStorage key: pop-unders fire at most once per visit. */
const POPUNDER_KEY = "bp_popunder_fired";

/** script srcs already requested (dedupe across slots and re-mounts). */
const loadedScripts = new Set<string>();

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

/** Load a script once. Scripts the page blocked (CSP etc.) resolve quietly. */
export function loadAdScript(src: string): Promise<void> {
  return new Promise((resolve) => {
    if (loadedScripts.has(src)) return resolve();
    const existing = Array.from(document.querySelectorAll<HTMLScriptElement>("script[data-bp-ad]")).find(
      (s) => s.getAttribute("data-bp-ad") === src
    );
    if (existing) {
      loadedScripts.add(src);
      return resolve();
    }
    const el = document.createElement("script");
    el.async = true;
    el.setAttribute("data-bp-ad", src);
    el.addEventListener("load", () => {
      loadedScripts.add(src);
      resolve();
    });
    el.addEventListener("error", () => {
      loadedScripts.add(src);
      resolve();
    });
    el.src = src;
    document.head.appendChild(el);
  });
}

/** Script src for a canonical (non-raw) slot, with {token} substituted. */
function canonicalScriptSrc(slot: InstanceAdSlot): string | null {
  if (slot.network === "adsense") return ADSENSE_LOADER;
  const src = slot.params?.script?.src?.trim();
  if (!src) return null;
  const token = slot.params?.script?.token?.trim();
  return token ? src.replace("{token}", encodeURIComponent(token)) : src;
}

/**
 * Fire the loader for a pop-under network at most once per visit (and never for
 * more than one network). Returns false when the guard says "don't".
 */
function popunderOnce(): boolean {
  if (!sessionStorage.getItem(POPUNDER_KEY)) {
    sessionStorage.setItem(POPUNDER_KEY, "1");
    return true;
  }
  return false;
}

/** Mount an ad into `container`. Cheap, idempotent per container. */
export function mountAdSlot(container: HTMLElement, slot: InstanceAdSlot): void {
  if (container.dataset.bpAdMounted) return;
  container.dataset.bpAdMounted = "1";
  container.dataset.bpAdNetwork = slot.network;

  const params = slot.params ?? {};

  if (slot.network === "raw") {
    if (params.raw?.trim()) injectRawSnippet(container, params.raw);
    return;
  }

  if (slot.network === "adsense") {
    mountAdSense(container, params.adsense ?? { client: "", slot: "", autoEnabled: false });
    return;
  }

  const src = canonicalScriptSrc(slot);
  if (!src) return;
  if (POPUNDER_NETWORKS.has(slot.network) && !popunderOnce()) return;
  void loadAdScript(src);
}

/**
 * Raw operator HTML. innerHTML does not execute <script> nodes, so every
 * script element is recreated as a live <script> (external src kept, inline
 * body kept) — the standard way ad snippets actually run. This is the one
 * intentionally unsanitized channel in the platform.
 */
function injectRawSnippet(container: HTMLElement, html: string): void {
  container.innerHTML = html;
  const stale = Array.from(container.querySelectorAll("script"));
  for (const old of stale) {
    const fresh = document.createElement("script");
    if (old.src) {
      fresh.async = true;
      fresh.src = old.src;
    } else {
      fresh.textContent = old.textContent ?? "";
    }
    old.parentNode?.replaceChild(fresh, old);
  }
}

/**
 * AdSense: loader + optional manual <ins> unit. `autoEnabled` loads only the
 * page-level auto-ads script (no <ins>); otherwise a <div> block is built and a
 * push registered once the loader is ready.
 */
function mountAdSense(
  container: HTMLElement,
  p: { client: string; slot: string; autoEnabled: boolean }
): void {
  const clientParam = p.client ? `?client=${encodeURIComponent(p.client)}` : "";
  const loaderSrc = `${ADSENSE_LOADER}${clientParam}`;
  void loadAdScript(loaderSrc).then(() => {
    if (p.autoEnabled || !p.slot) return;
    if (!container.isConnected) return;
    const ins = document.createElement("ins");
    ins.className = "adsbygoogle";
    ins.style.display = "block";
    if (p.client) ins.setAttribute("data-ad-client", p.client);
    ins.setAttribute("data-ad-slot", p.slot);
    ins.setAttribute("data-ad-format", "auto");
    ins.setAttribute("data-full-width-responsive", "true");
    container.appendChild(ins);
    (window.adsbygoogle = window.adsbygoogle || []).push({});
  });
}