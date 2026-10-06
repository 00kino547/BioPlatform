import { useEffect } from "react";
import { api } from "@/lib/api";

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

    void applyConsent();

    const onConsentChange = () => {
      void applyConsent();
    };
    window.addEventListener("bio:consent-changed", onConsentChange);
    return () => {
      alive = false;
      window.removeEventListener("bio:consent-changed", onConsentChange);
    };
  }, []);

  return null;
}