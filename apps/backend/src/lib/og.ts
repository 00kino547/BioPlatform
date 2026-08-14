export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function robotsMeta(): string {
  return '<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" />';
}

function ogImageMeta(url: string, alt: string, width = "1200", height = "630"): string {
  const urlEsc = escapeHtml(url);
  const altEsc = escapeHtml(alt);
  return [
    `<meta property="og:image" content="${urlEsc}" />`,
    `<meta property="og:image:width" content="${width}" />`,
    `<meta property="og:image:height" content="${height}" />`,
    `<meta property="og:image:alt" content="${altEsc}" />`,
    `<meta name="twitter:image:alt" content="${altEsc}" />`,
  ].join("\n");
}

export interface OgPageInput {
  username: string;
  displayName: string | null;
  bio: string | null;
  avatar: string | null;
  sameAs: string[];
  appName: string;
  appTagline: string;
  imageUrl: string;
  canonicalUrl: string;
}

export function buildOgPage(input: OgPageInput): string {
  const name = input.displayName || input.username;
  const title = `${name} (@${input.username})`;

  const description = input.bio || input.appTagline;

  const titleEsc = escapeHtml(title);
  const descEsc = escapeHtml(description);

  const personJson = escapeHtml(
    JSON.stringify({
      "@context": "https://schema.org",
      "@type": "ProfilePage",
      mainEntity: {
        "@type": "Person",
        name,
        url: input.canonicalUrl,
        image: input.avatar ?? undefined,
        description: input.bio ?? undefined,
        sameAs: input.sameAs.length > 0 ? input.sameAs : undefined,
      },
    })
  );

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta http-equiv="refresh" content="0; url=${escapeHtml(input.canonicalUrl)}" />
<title>${titleEsc} · ${escapeHtml(input.appName)}</title>
<meta name="description" content="${descEsc}" />
${robotsMeta()}
<link rel="canonical" href="${escapeHtml(input.canonicalUrl)}" />
<meta property="og:locale" content="en_US" />
<meta property="og:type" content="profile" />
<meta property="og:url" content="${escapeHtml(input.canonicalUrl)}" />
<meta property="og:title" content="${titleEsc}" />
<meta property="og:description" content="${descEsc}" />
${input.imageUrl ? ogImageMeta(input.imageUrl, `${title} on ${input.appName}`) : ""}
<meta property="og:site_name" content="${escapeHtml(input.appName)}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${titleEsc}" />
<meta name="twitter:description" content="${descEsc}" />
${input.imageUrl ? `<meta name="twitter:image" content="${escapeHtml(input.imageUrl)}" />` : ""}
<script type="application/ld+json">${personJson}</script>
</head>
<body>
<p>Redirecting to <a href="${escapeHtml(input.canonicalUrl)}">${escapeHtml(input.canonicalUrl)}</a>…</p>
</body>
</html>`;
}

export interface LandingOgPageInput {
  appName: string;
  appTagline: string;
  canonicalUrl: string;
  imageUrl?: string | null;
}

export function buildLandingOgPage(input: LandingOgPageInput): string {
  const title = input.appName;
  const description = input.appTagline;
  const titleEsc = escapeHtml(title);
  const descEsc = escapeHtml(description);

  const siteJson = escapeHtml(
    JSON.stringify({
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: input.appName,
      description: input.appTagline,
      url: input.canonicalUrl,
    })
  );

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta http-equiv="refresh" content="0; url=${escapeHtml(input.canonicalUrl)}" />
<title>${titleEsc}</title>
<meta name="description" content="${descEsc}" />
${robotsMeta()}
<link rel="canonical" href="${escapeHtml(input.canonicalUrl)}" />
<meta property="og:locale" content="en_US" />
<meta property="og:type" content="website" />
<meta property="og:url" content="${escapeHtml(input.canonicalUrl)}" />
<meta property="og:title" content="${titleEsc}" />
<meta property="og:description" content="${descEsc}" />
${input.imageUrl ? ogImageMeta(input.imageUrl, title) : ""}
<meta property="og:site_name" content="${titleEsc}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${titleEsc}" />
<meta name="twitter:description" content="${descEsc}" />
${input.imageUrl ? `<meta name="twitter:image" content="${escapeHtml(input.imageUrl)}" />` : ""}
<script type="application/ld+json">${siteJson}</script>
</head>
<body>
<p>Redirecting to <a href="${escapeHtml(input.canonicalUrl)}">${escapeHtml(input.canonicalUrl)}</a>…</p>
</body>
</html>`;
}
