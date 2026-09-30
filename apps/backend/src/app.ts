import express from "express";
import cors from "cors";
import { getEnv } from "./config/env.js";
import authRoutes from "./routes/auth.js";
import oauthRoutes from "./routes/oauth.js";
import enterpriseSsoRoutes from "./routes/enterpriseSso.js";
import inviteRoutes from "./routes/invite.js";
import affiliateRoutes from "./routes/affiliate.js";
import orderRoutes from "./routes/orders.js";
import adminRoutes from "./routes/admin.js";
import profileRoutes from "./routes/profile.js";
import analyticsRoutes from "./routes/analytics.js";
import emailRoutes from "./routes/email.js";
import musicRoutes from "./routes/music.js";
import webhookRoutes from "./routes/webhook.js";
import discordRoutes from "./routes/discord.js";
import badgeRoutes from "./routes/badges.js";
import versionRoutes from "./routes/version.js";
import landingRoutes from "./routes/landing.js";
import featureRoutes from "./routes/features.js";
import { renderProfileOgPage } from "./lib/profileOg.js";
import { renderLandingOgCached } from "./lib/landingOg.js";
import { buildLandingOgPage } from "./lib/og.js";
import { buildRobotsTxt, buildSitemapXml, buildSubSitemapXml, buildLlmstxt, buildLlmstxtFull } from "./lib/seo.js";
import { openapi } from "./lib/openapi.js";
import { getCaptchaConfig } from "./lib/captcha.js";
import domainRoutes from "./routes/domain.js";
import { resolveCustomDomain } from "./middleware/domain.js";
import { getChallenge } from "./lib/acme.js";
import { serveUpload } from "./lib/media.js";
import { resolveActiveSeasonalTheme } from "./lib/seasonalThemes.js";
import mediaProxyRoutes from "./routes/mediaProxy.js";
import privacyRoutes from "./routes/privacy.js";
import newsletterRoutes from "./routes/newsletter.js";
import tipsRoutes from "./routes/tips.js";
import shopRoutes from "./routes/shop.js";
import paymentWebhooksRoutes from "./routes/paymentWebhooks.js";

const env = getEnv();
const app = express();

app.set("trust proxy", env.TRUST_PROXY);

const allowedOrigins = env.CORS_ORIGIN.split(",").map((o) => o.trim());
app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use("/api/payments/webhooks", express.raw({ type: "application/json", limit: "2mb" }));
app.use(express.json());
app.use(resolveCustomDomain);

app.use("/uploads", serveUpload);

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.get("/api/openapi.json", (_req, res) => {
  res.json(openapi);
});

// Public: the currently-active platform-wide theme (colors + animated FX), used by the landing page.
app.get("/api/theming/active", async (_req, res) => {
  const resolved = await resolveActiveSeasonalTheme();
  res.json({ success: true, data: { theme: resolved.theme, source: resolved.source } });
});

app.get("/.well-known/acme-challenge/:token", (req, res) => {
  const body = getChallenge(req.params.token);
  if (!body) {
    return res.status(404).end();
  }
  res.setHeader("Content-Type", "text/plain");
  res.send(body);
});

app.get("/og.png", async (req, res) => {
  const result = await renderLandingOgCached();
  if (req.headers["if-none-match"] === result.etag) {
    return res.status(304).end();
  }
  res.setHeader("Content-Type", "image/png");
  res.setHeader("ETag", result.etag);
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.send(result.buffer);
});

app.get("/robots.txt", async (_req, res) => {
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.send(await buildRobotsTxt());
});

app.get("/sitemap.xml", async (_req, res) => {
  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=600");
  res.send(await buildSitemapXml());
});

app.get("/sitemap-:index.xml", async (req, res) => {
  const raw = req.params.index;
  if (!/^\d+$/.test(raw)) {
    return res.status(404).end();
  }
  const index = Number.parseInt(raw, 10);
  if (!Number.isSafeInteger(index) || index < 0) {
    return res.status(404).end();
  }
  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=600");
  const xml = await buildSubSitemapXml(index);
  if (xml === null) {
    return res.status(404).end();
  }
  res.send(xml);
});

app.get("/llms.txt", async (_req, res) => {
  res.setHeader("Content-Type", "text/markdown; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.send(await buildLlmstxt());
});

app.get("/llms-full.txt", async (_req, res) => {
  res.setHeader("Content-Type", "text/markdown; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.send(await buildLlmstxtFull());
});

app.get("/api/captcha/config", (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json({ success: true, data: getCaptchaConfig() });
});

app.use("/api/auth", authRoutes);
app.use("/api/auth/oauth", oauthRoutes);
app.use("/api/auth/sso", enterpriseSsoRoutes);
app.use("/api/invites", inviteRoutes);
app.use("/api/affiliate", affiliateRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/profiles", profileRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/email", emailRoutes);
app.use("/api/music", musicRoutes);
app.use("/api/media", mediaProxyRoutes);
app.use("/api/privacy", privacyRoutes);
app.use("/api/newsletter", newsletterRoutes);
app.use("/api/tips", tipsRoutes);
app.use("/api/shop", shopRoutes);
app.use("/api/payments/webhooks", paymentWebhooksRoutes);
app.use("/api/webhooks", webhookRoutes);
app.use("/api/discord", discordRoutes);
app.use("/api/badges", badgeRoutes);
app.use("/api/version", versionRoutes);
app.use("/api/landing", landingRoutes);
app.use("/api/features", featureRoutes);
app.use("/api", domainRoutes);

const RESERVED_PATHS = new Set(["api", "health", "favicon.ico", "robots.txt", "sitemap.xml", "llms.txt", "llms-full.txt", "uploads", "og.png"]);

app.get("/", async (req, res) => {
  const host = (req.hostname ?? "").toLowerCase().replace(/\.$/, "");
  if (!req.customDomain) {
    return res.status(404).end();
  }
  const canonicalUrl = `https://${host}`;
  const landingOgImage = `${env.APP_URL.replace(/\/+$/, "")}/og.png`;
  if (req.customDomain.rootTarget) {
    const html = await renderProfileOgPage(req.customDomain.rootTarget, { host, root: true });
    if (!html) {
      const landing = buildLandingOgPage({ appName: env.APP_NAME, appTagline: env.APP_TAGLINE, canonicalUrl, imageUrl: landingOgImage });
      return res.setHeader("Content-Type", "text/html; charset=utf-8").send(landing);
    }
    return res.setHeader("Content-Type", "text/html; charset=utf-8").send(html);
  }
  const landing = buildLandingOgPage({ appName: env.APP_NAME, appTagline: env.APP_TAGLINE, canonicalUrl, imageUrl: landingOgImage });
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(landing);
});

app.get("/:username", async (req, res) => {
  const username = req.params.username as string;
  if (RESERVED_PATHS.has(username)) {
    return res.status(404).end();
  }
  const options = req.customDomain ? { host: (req.hostname ?? "").toLowerCase().replace(/\.$/, "") } : undefined;
  const html = await renderProfileOgPage(username, options);
  if (!html) {
    return res.status(404).end();
  }
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(html);
});

export default app;
