import app from "./app.js";
import { getEnv } from "./config/env.js";
import { prisma } from "./lib/prisma.js";
import { startWebhookRetrySweep } from "./lib/webhook.js";
import { startUpdateChecker } from "./lib/versionCheck.js";
import { startBotSession } from "./lib/discordGateway.js";
import { startAcmeLoop, acmeTick } from "./lib/acme.js";
import { startOrphanCleanup } from "./lib/orphanCleanup.js";
import { getPocketbaseConfig } from "./lib/pocketbase/index.js";
import { maybeAutoNotifyPolicyChange } from "./lib/policyNotice.js";

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

const ANALYTICS_RETENTION_DAYS = 90;
const ANALYTICS_CLEANUP_INTERVAL_MINUTES = 6 * 60;
let pruningAnalytics = false;

async function pruneAnalytics() {
  if (pruningAnalytics) return;
  pruningAnalytics = true;
  try {
    const cutoff = new Date(Date.now() - ANALYTICS_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const [views, clicks] = await Promise.all([
      prisma.pageView.deleteMany({ where: { createdAt: { lt: cutoff } } }),
      prisma.linkClick.deleteMany({ where: { createdAt: { lt: cutoff } } }),
    ]);
    if (views.count > 0 || clicks.count > 0) {
      console.log(`Pruned analytics older than ${ANALYTICS_RETENTION_DAYS} days: ${views.count} views, ${clicks.count} clicks`);
    }
  } catch (error) {
    console.error("Failed to prune analytics:", error);
  } finally {
    pruningAnalytics = false;
  }
}

setInterval(() => {
  void pruneAnalytics();
}, ANALYTICS_CLEANUP_INTERVAL_MINUTES * 60 * 1000);

// PocketBase is optional and supports exactly one capability: the sign-in
// provider. Report its status once at boot so an operator can see at a glance
// whether the optional provider is available. This never contacts PocketBase and
// never throws: an unreachable instance must not affect a boot, because nothing
// in core BioPlatform depends on it.
function logPocketbaseStatus() {
  const cfg = getPocketbaseConfig();
  if (!cfg.enabled) {
    console.log("PocketBase: not configured (POCKETBASE_URL empty) — sign-in provider unavailable");
    return;
  }
  if (!cfg.oauthEnabled) {
    console.log("PocketBase: configured but POCKETBASE_OAUTH_ENABLED=false — sign-in provider off");
    return;
  }
  console.log(`PocketBase: sign-in provider enabled (auth collection "${cfg.authCollection}")`);
}

async function main() {
  await prisma.$connect();
  console.log("Database connected");

  logPocketbaseStatus();

  startWebhookRetrySweep();
  startUpdateChecker();
  console.log("Update checker started");

  if (env.ORPHAN_CLEANUP_ENABLED) {
    startOrphanCleanup();
  } else {
    console.log("Orphan cleanup disabled (ORPHAN_CLEANUP_ENABLED=false)");
  }

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

  // Automatic legal-policy change notice. No-op unless POLICY_NOTICE_AUTO_EMAIL
  // is on, mail is configured, and the current POLICY_VERSIONS pair has not
  // already been announced. Deliberately not awaited so a slow mail relay can
  // never delay startup, and wrapped so a mail failure cannot kill the process.
  void maybeAutoNotifyPolicyChange()
    .then(() => undefined)
    .catch((error) => {
      console.error("Policy change notice failed:", error instanceof Error ? error.message : error);
    });

  app.listen(env.PORT, () => {
    console.log(`Server running on port ${env.PORT}`);
  });
}

main().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
