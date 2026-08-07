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
import { openapi } from "./lib/openapi.js";

const env = getEnv();
const app = express();

app.set("trust proxy", env.TRUST_PROXY);

const allowedOrigins = env.CORS_ORIGIN.split(",").map((o) => o.trim());
app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json());

app.use("/uploads", express.static(path.resolve(env.LOCAL_STORAGE_PATH)));

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.get("/api/openapi.json", (_req, res) => {
  res.json(openapi);
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

const RESERVED_PATHS = new Set(["api", "health", "favicon.ico", "robots.txt", "uploads"]);

app.get("/:username", async (req, res) => {
  const username = req.params.username as string;
  if (RESERVED_PATHS.has(username)) {
    return res.status(404).end();
  }
  const html = await renderProfileOgPage(username);
  if (!html) {
    return res.status(404).end();
  }
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(html);
});

export default app;
