import app from "./app.js";
import { getEnv } from "./config/env.js";
import { prisma } from "./lib/prisma.js";
import { startWebhookRetrySweep } from "./lib/webhook.js";
import { restoreDiscordSessions } from "./routes/discord.js";

const env = getEnv();

async function pruneAuthLogs() {
  try {
    const now = new Date();
    const expired = await prisma.authLog.deleteMany({
      where: { expiresAt: { not: null, lt: now } },
    });
    const retentionCutoff = new Date(Date.now() - env.AUTH_LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const old = await prisma.authLog.deleteMany({
      where: { createdAt: { lt: retentionCutoff } },
    });
    if (expired.count > 0 || old.count > 0) {
      console.log(
        `Pruned auth logs: ${expired.count} expired, ${old.count} older than ${env.AUTH_LOG_RETENTION_DAYS} days`
      );
    }
  } catch (error) {
    console.error("Failed to prune auth logs:", error);
  }
}

setInterval(() => {
void pruneAuthLogs();
startWebhookRetrySweep();
}, env.AUTH_LOG_CLEANUP_INTERVAL_MINUTES * 60 * 1000);

void pruneAuthLogs();

async function main() {
  await prisma.$connect();
  console.log("Database connected");

  void restoreDiscordSessions();

  app.listen(env.PORT, () => {
    console.log(`Server running on port ${env.PORT}`);
  });
}

main().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
