export const branding = {
  name: import.meta.env.VITE_APP_NAME || "BioPlatform",
  tagline: import.meta.env.VITE_APP_TAGLINE || "Your digital identity, beautifully crafted.",
  description: import.meta.env.VITE_APP_DESCRIPTION || "Create a stunning profile page that showcases who you are.",
  url: import.meta.env.VITE_APP_URL || "http://localhost:80",
  githubUrl: import.meta.env.VITE_APP_GITHUB_URL || "https://github.com/00kino547/BioPlatform",
  contactUrl: import.meta.env.VITE_CONTACT_URL || "https://github.com/00kino547/BioPlatform/issues",
  statusUrl: import.meta.env.VITE_STATUS_URL || "",
  docsUrl: import.meta.env.VITE_DOCS_URL || "https://github.com/00kino547/BioPlatform/tree/main/docs",
  ogImage: import.meta.env.VITE_APP_OG_IMAGE || `${import.meta.env.VITE_APP_URL || "http://localhost:80"}/og.png`,
} as const;
