import { useEffect } from "react";
import { api } from "@/lib/api";
import { resetPocketbaseConsentCache, trackPocketbaseClick, trackPocketbasePageview } from "@/lib/pocketbase";

declare global {
  interface Window {
    _paq?: Array<unknown[]>;
  }
}

async function hasAnalyticsConsent(): Promise<boolean> {
  try {
    const res = await fetch("/api/privacy/consent", { credentials: "same-origin" });
    const json = (await res.json()) as { data?: { effective?: string } };
    return json?.data?.effective === "accept";
  } catch {
    return false;
  }
}

export function AnalyticsLoader() {
  useEffect(() => {
    let alive = true;
    let injected = false;

    const injectMatomo = async () => {
      const res = await api.getExternalAnalyticsConfig();
      if (!alive || !res.success || !res.data?.enabled) return;
      const { matomoUrl, matomoSiteId } = res.data;
      if (!matomoUrl || matomoSiteId <= 0) return;

      injected = true;
      const base = matomoUrl.replace(/\/+$/, "");
      window._paq = window._paq ?? [];
      window._paq.push(["requireConsent"]);
      window._paq.push(["setTrackerUrl", `${base}/matomo.php`]);
      window._paq.push(["setSiteId", matomoSiteId]);
      const script = document.createElement("script");
      script.async = true;
      script.src = `${base}/matomo.js`;
      document.head.appendChild(script);
    };

    const applyConsent = async () => {
      const allowed = await hasAnalyticsConsent();
      if (!alive) return;
      if (allowed) {
        if (!injected) await injectMatomo();
        window._paq?.push(["setConsentGiven"]);
      } else {
        window._paq?.push(["forgetConsentGiven"]);
      }
    };

    // PocketBase analytics: same consent gate as Matomo. We listen for the
    // pageview custom event dispatched by PublicProfile and delegate clicks on
    // `[data-bio-link]` (PublicProfile adds those attrs to each link item).
    const onPocketbasePageview = (event: Event) => {
      const detail = (event as CustomEvent<{ slug?: string; url?: string; referrer?: string }>).detail;
      if (!detail?.slug) return;
      const url = detail.url ?? window.location.href;
      const referrer = detail.referrer ?? document.referrer;
      void trackPocketbasePageview(detail.slug, url, referrer);
    };

    const onPocketbaseClick = (event: MouseEvent) => {
      const target = event.target as Element | null;
      const linkEl = target?.closest?.("[data-bio-link]") as HTMLElement | null;
      if (!linkEl || event.defaultPrevented || event.button !== 0) return;
      const slug = document.documentElement.dataset.bioProfileSlug || "";
      const platform = linkEl.dataset.bioPlatform || "";
      const label = linkEl.dataset.bioLabel || "";
      const href = linkEl.getAttribute("href") || linkEl.textContent?.trim() || "";
      if (!slug || !platform) return;
      void trackPocketbaseClick(slug, platform, href, label);
    };

    void applyConsent();

    const onConsentChange = () => {
      resetPocketbaseConsentCache();
      void applyConsent();
    };
    window.addEventListener("bio:consent-changed", onConsentChange);
    window.addEventListener("bio:pb-pageview", onPocketbasePageview);
    document.addEventListener("click", onPocketbaseClick);
    return () => {
      alive = false;
      window.removeEventListener("bio:consent-changed", onConsentChange);
      window.removeEventListener("bio:pb-pageview", onPocketbasePageview);
      document.removeEventListener("click", onPocketbaseClick);
    };
  }, []);

  return null;
}