import { useEffect } from "react";
import { branding } from "@/config/branding";

function setMeta(attr: "name" | "property", key: string, content: string) {
  let el = document.head.querySelector(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

export function useJsonLd(id: string, data: object | null) {
  useEffect(() => {
    if (!data) return;
    let el = document.getElementById(`ld-${id}`) as HTMLScriptElement | null;
    if (!el) {
      el = document.createElement("script");
      el.id = `ld-${id}`;
      el.type = "application/ld+json";
      document.head.appendChild(el);
    }
    el.textContent = JSON.stringify(data);
    return () => {
      document.getElementById(`ld-${id}`)?.remove();
    };
  }, [id, data]);
}

export interface PageMetaOptions {
  title: string;
  description?: string;
  url?: string;
  image?: string | null;
  baseUrl?: string;
}

export function usePageMeta({ title, description, url, image, baseUrl }: PageMetaOptions) {
  useEffect(() => {
    const fullTitle = title.includes(branding.name) ? title : `${title} — ${branding.name}`;
    const desc = description || branding.description;
    const root = (baseUrl ?? branding.url).replace(/\/+$/, "");
    const canonical = url
      ? url.startsWith("http")
        ? url
        : `${root}${url.startsWith("/") ? url : `/${url}`}`
      : root;

    document.title = fullTitle;
    setMeta("name", "description", desc);
    setMeta("property", "og:type", "website");
    setMeta("property", "og:site_name", branding.name);
    setMeta("property", "og:title", fullTitle);
    setMeta("property", "og:description", desc);
    setMeta("property", "og:url", canonical);
    setMeta("name", "twitter:card", "summary_large_image");
    setMeta("name", "twitter:title", fullTitle);
    setMeta("name", "twitter:description", desc);
    setMeta("name", "twitter:url", canonical);

    if (image) {
      setMeta("property", "og:image", image);
      setMeta("name", "twitter:image", image);
    }

    let canonicalLink = document.head.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!canonicalLink) {
      canonicalLink = document.createElement("link");
      canonicalLink.rel = "canonical";
      document.head.appendChild(canonicalLink);
    }
    canonicalLink.href = canonical;
  }, [title, description, url, image]);
}
