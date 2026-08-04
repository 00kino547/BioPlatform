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

const env = getEnv();
const app = express();

const allowedOrigins = env.CORS_ORIGIN.split(",").map((o) => o.trim());
app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json());

app.use("/uploads", express.static(path.resolve(env.LOCAL_STORAGE_PATH)));

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.use("/api/auth", authRoutes);
app.use("/api/invites", inviteRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/profiles", profileRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/email", emailRoutes);

export default app;
