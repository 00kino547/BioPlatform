import express from "express";
import cors from "cors";
import path from "path";
import { getEnv } from "./config/env.js";
import authRoutes from "./routes/auth.js";
import inviteRoutes from "./routes/invite.js";
import adminRoutes from "./routes/admin.js";
import profileRoutes from "./routes/profile.js";
import analyticsRoutes from "./routes/analytics.js";
import emailRoutes from "./routes/email.js";
import musicRoutes from "./routes/music.js";
import webhookRoutes from "./routes/webhook.js";
import discordRoutes from "./routes/discord.js";
import badgeRoutes from "./routes/badges.js";
import { renderProfileOgPage } from "./lib/profileOg.js";
import { buildLandingOgPage } from "./lib/og.js";
import { buildRobotsTxt, buildSitemapXml, buildLlmstxt, buildLlmstxtFull } from "./lib/seo.js";
import { openapi } from "./lib/openapi.js";
import domainRoutes from "./routes/domain.js";
import { resolveCustomDomain } from "./middleware/domain.js";
import { getChallenge } from "./lib/acme.js";
import { optimizeUploadImage } from "./lib/media.js";

const env = getEnv();
const app = express();

app.set("trust proxy", env.TRUST_PROXY);

const allowedOrigins = env.CORS_ORIGIN.split(",").map((o) => o.trim());
app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json());
app.use(resolveCustomDomain);

app.use(
  "/uploads",
  optimizeUploadImage,
  express.static(path.resolve(env.LOCAL_STORAGE_PATH), { maxAge: "365d", immutable: true })
);

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.get("/api/openapi.json", (_req, res) => {
  res.json(openapi);
});

app.get("/.well-known/acme-challenge/:token", (req, res) => {
  const body = getChallenge(req.params.token);
  if (!body) {
    return res.status(404).end();
  }
  res.setHeader("Content-Type", "text/plain");
  res.send(body);
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

app.use("/api/auth", authRoutes);
app.use("/api/invites", inviteRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/profiles", profileRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/email", emailRoutes);
app.use("/api/music", musicRoutes);
app.use("/api/webhooks", webhookRoutes);
app.use("/api/discord", discordRoutes);
app.use("/api/badges", badgeRoutes);
app.use("/api", domainRoutes);

const RESERVED_PATHS = new Set(["api", "health", "favicon.ico", "robots.txt", "sitemap.xml", "llms.txt", "llms-full.txt", "uploads"]);

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
