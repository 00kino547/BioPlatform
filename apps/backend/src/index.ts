import app from "./app.js";
import { getEnv } from "./config/env.js";
import { prisma } from "./lib/prisma.js";
import { startWebhookRetrySweep } from "./lib/webhook.js";
import { startUpdateChecker } from "./lib/versionCheck.js";
import { startBotSession } from "./lib/discordGateway.js";
import { startAcmeLoop, acmeTick } from "./lib/acme.js";

const env = getEnv();

let pruningAuthLogs = false;

async function pruneAuthLogs() {
  if (pruningAuthLogs) return;
  pruningAuthLogs = true;
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
  } finally {
    pruningAuthLogs = false;
  }
}

setInterval(() => {
  void pruneAuthLogs();
}, env.AUTH_LOG_CLEANUP_INTERVAL_MINUTES * 60 * 1000);

void pruneAuthLogs();

async function main() {
  await prisma.$connect();
  console.log("Database connected");

  startWebhookRetrySweep();
  startUpdateChecker();
  console.log("Update checker started");

  if (env.DISCORD_BOT_TOKEN) {
    startBotSession(env.DISCORD_BOT_TOKEN);
    console.log("Discord presence bot session started");
  }

  if (env.ACME_ENABLED) {
    startAcmeLoop();
    console.log("ACME certificate service started");
  } else {
    void acmeTick();
    console.log("ACME certificate service disabled (ACME_ENABLED not set)");
  }

  app.listen(env.PORT, () => {
    console.log(`Server running on port ${env.PORT}`);
  });
}

main().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
