export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface OgPageInput {
  username: string;
  displayName: string | null;
  bio: string | null;
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

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta http-equiv="refresh" content="0; url=${escapeHtml(input.canonicalUrl)}" />
<title>${titleEsc} · ${escapeHtml(input.appName)}</title>
<meta name="description" content="${descEsc}" />
<link rel="canonical" href="${escapeHtml(input.canonicalUrl)}" />
<meta property="og:type" content="profile" />
<meta property="og:url" content="${escapeHtml(input.canonicalUrl)}" />
<meta property="og:title" content="${titleEsc}" />
<meta property="og:description" content="${descEsc}" />
<meta property="og:image" content="${escapeHtml(input.imageUrl)}" />
<meta property="og:site_name" content="${escapeHtml(input.appName)}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${titleEsc}" />
<meta name="twitter:description" content="${descEsc}" />
<meta name="twitter:image" content="${escapeHtml(input.imageUrl)}" />
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
}

export function buildLandingOgPage(input: LandingOgPageInput): string {
  const title = input.appName;
  const description = input.appTagline;
  const titleEsc = escapeHtml(title);
  const descEsc = escapeHtml(description);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta http-equiv="refresh" content="0; url=${escapeHtml(input.canonicalUrl)}" />
<title>${titleEsc}</title>
<meta name="description" content="${descEsc}" />
<link rel="canonical" href="${escapeHtml(input.canonicalUrl)}" />
<meta property="og:type" content="website" />
<meta property="og:url" content="${escapeHtml(input.canonicalUrl)}" />
<meta property="og:title" content="${titleEsc}" />
<meta property="og:description" content="${descEsc}" />
<meta property="og:site_name" content="${titleEsc}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${titleEsc}" />
<meta name="twitter:description" content="${descEsc}" />
</head>
<body>
<p>Redirecting to <a href="${escapeHtml(input.canonicalUrl)}">${escapeHtml(input.canonicalUrl)}</a>…</p>
</body>
</html>`;
}
