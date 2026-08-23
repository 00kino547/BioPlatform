import { getEnv } from "@/config/env";

export const branding = {
  name: getEnv("VITE_APP_NAME") || "BioPlatform",
  tagline: getEnv("VITE_APP_TAGLINE") || "Your digital identity, beautifully crafted.",
  description:
    getEnv("VITE_APP_DESCRIPTION") || "Create a stunning profile page that showcases who you are.",
  url: getEnv("VITE_APP_URL") || "http://localhost:80",
  githubUrl: getEnv("VITE_APP_GITHUB_URL") || "https://github.com/00kino547/BioPlatform",
  contactUrl: getEnv("VITE_CONTACT_URL") || "https://github.com/00kino547/BioPlatform/issues",
  statusUrl: getEnv("VITE_STATUS_URL") || "",
  docsUrl: getEnv("VITE_DOCS_URL") || "https://github.com/00kino547/BioPlatform/tree/main/docs",
  ogImage:
    getEnv("VITE_APP_OG_IMAGE") || `${getEnv("VITE_APP_URL") || "http://localhost:80"}/og.png`,
} as const;
