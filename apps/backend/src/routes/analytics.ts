import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { requireApiLevel } from "../middleware/admin.js";
import { profileScope } from "../lib/profile.js";
import { getExternalAnalyticsConfig } from "../lib/externalAnalytics.js";

const router = Router();

// Public config for the consent-aware external analytics loader. Contains
// no secrets — the Matomo JS tracker does not require the auth token.
router.get("/config", (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json({ success: true, data: getExternalAnalyticsConfig() });
});

router.get("/me", requireAuth, requireApiLevel("advanced"), async (req, res) => {
  const profile = await prisma.profile.findFirst({
    where: profileScope(req.userId!, req.query.profileId),
    select: { id: true },
  });

  if (!profile) {
    return res.status(404).json({ success: false, error: "Profile not found" });
  }

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const [totalViews, totalClicks, viewsLast30d, clicksLast30d, viewsLast7d, clicksLast7d, viewsLast24h, clicksLast24h] =
    await Promise.all([
      prisma.pageView.count({ where: { profileId: profile.id } }),
      prisma.linkClick.count({ where: { profileId: profile.id } }),
      prisma.pageView.count({ where: { profileId: profile.id, createdAt: { gte: thirtyDaysAgo } } }),
      prisma.linkClick.count({ where: { profileId: profile.id, createdAt: { gte: thirtyDaysAgo } } }),
      prisma.pageView.count({ where: { profileId: profile.id, createdAt: { gte: sevenDaysAgo } } }),
      prisma.linkClick.count({ where: { profileId: profile.id, createdAt: { gte: sevenDaysAgo } } }),
      prisma.pageView.count({ where: { profileId: profile.id, createdAt: { gte: twentyFourHoursAgo } } }),
      prisma.linkClick.count({ where: { profileId: profile.id, createdAt: { gte: twentyFourHoursAgo } } }),
    ]);

  const [uniqueViewsAll, uniqueClicksAll, uniqueViews30d, uniqueClicks30d, uniqueViews7d, uniqueClicks7d, uniqueViews24h, uniqueClicks24h] =
    await Promise.all([
      prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(DISTINCT CASE WHEN visitor_id IS NOT NULL THEN visitor_id ELSE ip || '|' || COALESCE(user_agent, '') END) as count
        FROM page_views WHERE profile_id = ${profile.id}::uuid
      `,
      prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(DISTINCT CASE WHEN visitor_id IS NOT NULL THEN visitor_id ELSE ip || '|' || COALESCE(user_agent, '') END) as count
        FROM link_clicks WHERE profile_id = ${profile.id}::uuid
      `,
      prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(DISTINCT CASE WHEN visitor_id IS NOT NULL THEN visitor_id ELSE ip || '|' || COALESCE(user_agent, '') END) as count
        FROM page_views WHERE profile_id = ${profile.id}::uuid AND created_at >= ${thirtyDaysAgo}
      `,
      prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(DISTINCT CASE WHEN visitor_id IS NOT NULL THEN visitor_id ELSE ip || '|' || COALESCE(user_agent, '') END) as count
        FROM link_clicks WHERE profile_id = ${profile.id}::uuid AND created_at >= ${thirtyDaysAgo}
      `,
      prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(DISTINCT CASE WHEN visitor_id IS NOT NULL THEN visitor_id ELSE ip || '|' || COALESCE(user_agent, '') END) as count
        FROM page_views WHERE profile_id = ${profile.id}::uuid AND created_at >= ${sevenDaysAgo}
      `,
      prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(DISTINCT CASE WHEN visitor_id IS NOT NULL THEN visitor_id ELSE ip || '|' || COALESCE(user_agent, '') END) as count
        FROM link_clicks WHERE profile_id = ${profile.id}::uuid AND created_at >= ${sevenDaysAgo}
      `,
      prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(DISTINCT CASE WHEN visitor_id IS NOT NULL THEN visitor_id ELSE ip || '|' || COALESCE(user_agent, '') END) as count
        FROM page_views WHERE profile_id = ${profile.id}::uuid AND created_at >= ${twentyFourHoursAgo}
      `,
      prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(DISTINCT CASE WHEN visitor_id IS NOT NULL THEN visitor_id ELSE ip || '|' || COALESCE(user_agent, '') END) as count
        FROM link_clicks WHERE profile_id = ${profile.id}::uuid AND created_at >= ${twentyFourHoursAgo}
      `,
    ]);

  const [viewsByDay, uniqueViewsByDay, clicksByDay, uniqueClicksByDay, clicksByPlatform, uniqueClicksByPlatform, topReferrers, viewsByHour, uniqueViewsByHour, clicksByHour, uniqueClicksByHour, clicksByLink, uniqueClicksByLink] =
    await Promise.all([
      prisma.$queryRaw<{ date: string; count: bigint }[]>`
        SELECT DATE(created_at)::text as date, COUNT(*) as count
        FROM page_views
        WHERE profile_id = ${profile.id}::uuid AND created_at >= ${thirtyDaysAgo}
        GROUP BY DATE(created_at)
        ORDER BY date ASC
        LIMIT 31
      `,
      prisma.$queryRaw<{ date: string; count: bigint }[]>`
        SELECT DATE(created_at)::text as date, COUNT(DISTINCT CASE WHEN visitor_id IS NOT NULL THEN visitor_id ELSE ip || '|' || COALESCE(user_agent, '') END) as count
        FROM page_views
        WHERE profile_id = ${profile.id}::uuid AND created_at >= ${thirtyDaysAgo}
        GROUP BY DATE(created_at)
        ORDER BY date ASC
        LIMIT 31
      `,
      prisma.$queryRaw<{ date: string; count: bigint }[]>`
        SELECT DATE(created_at)::text as date, COUNT(*) as count
        FROM link_clicks
        WHERE profile_id = ${profile.id}::uuid AND created_at >= ${thirtyDaysAgo}
        GROUP BY DATE(created_at)
        ORDER BY date ASC
        LIMIT 31
      `,
      prisma.$queryRaw<{ date: string; count: bigint }[]>`
        SELECT DATE(created_at)::text as date, COUNT(DISTINCT CASE WHEN visitor_id IS NOT NULL THEN visitor_id ELSE ip || '|' || COALESCE(user_agent, '') END) as count
        FROM link_clicks
        WHERE profile_id = ${profile.id}::uuid AND created_at >= ${thirtyDaysAgo}
        GROUP BY DATE(created_at)
        ORDER BY date ASC
        LIMIT 31
      `,
      prisma.$queryRaw<{ platform: string; count: bigint }[]>`
        SELECT platform, COUNT(*) as count
        FROM link_clicks
        WHERE profile_id = ${profile.id}::uuid AND created_at >= ${thirtyDaysAgo}
        GROUP BY platform
        ORDER BY count DESC
        LIMIT 50
      `,
      prisma.$queryRaw<{ platform: string; count: bigint }[]>`
        SELECT platform, COUNT(DISTINCT CASE WHEN visitor_id IS NOT NULL THEN visitor_id ELSE ip || '|' || COALESCE(user_agent, '') END) as count
        FROM link_clicks
        WHERE profile_id = ${profile.id}::uuid AND created_at >= ${thirtyDaysAgo}
        GROUP BY platform
        ORDER BY count DESC
        LIMIT 50
      `,
      prisma.$queryRaw<{ referer: string; count: bigint }[]>`
        SELECT COALESCE(referer, 'Direct') as referer, COUNT(*) as count
        FROM page_views
        WHERE profile_id = ${profile.id}::uuid AND created_at >= ${thirtyDaysAgo}
        GROUP BY referer
        ORDER BY count DESC
        LIMIT 5
      `,
      prisma.$queryRaw<{ hour: string; count: bigint }[]>`
        SELECT to_char(date_trunc('hour', created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:00:00') as hour, COUNT(*) as count
        FROM page_views
        WHERE profile_id = ${profile.id}::uuid AND created_at >= ${twentyFourHoursAgo}
        GROUP BY date_trunc('hour', created_at AT TIME ZONE 'UTC')
        ORDER BY hour ASC
        LIMIT 25
      `,
      prisma.$queryRaw<{ hour: string; count: bigint }[]>`
        SELECT to_char(date_trunc('hour', created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:00:00') as hour, COUNT(DISTINCT CASE WHEN visitor_id IS NOT NULL THEN visitor_id ELSE ip || '|' || COALESCE(user_agent, '') END) as count
        FROM page_views
        WHERE profile_id = ${profile.id}::uuid AND created_at >= ${twentyFourHoursAgo}
        GROUP BY date_trunc('hour', created_at AT TIME ZONE 'UTC')
        ORDER BY hour ASC
        LIMIT 25
      `,
      prisma.$queryRaw<{ hour: string; count: bigint }[]>`
        SELECT to_char(date_trunc('hour', created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:00:00') as hour, COUNT(*) as count
        FROM link_clicks
        WHERE profile_id = ${profile.id}::uuid AND created_at >= ${twentyFourHoursAgo}
        GROUP BY date_trunc('hour', created_at AT TIME ZONE 'UTC')
        ORDER BY hour ASC
        LIMIT 25
      `,
      prisma.$queryRaw<{ hour: string; count: bigint }[]>`
        SELECT to_char(date_trunc('hour', created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:00:00') as hour, COUNT(DISTINCT CASE WHEN visitor_id IS NOT NULL THEN visitor_id ELSE ip || '|' || COALESCE(user_agent, '') END) as count
        FROM link_clicks
        WHERE profile_id = ${profile.id}::uuid AND created_at >= ${twentyFourHoursAgo}
        GROUP BY date_trunc('hour', created_at AT TIME ZONE 'UTC')
        ORDER BY hour ASC
        LIMIT 25
      `,
      prisma.$queryRaw<{ platform: string; slug: string | null; count: bigint; last_clicked_at: Date | null }[]>`
        SELECT platform, slug, COUNT(*) as count, MAX(created_at) as last_clicked_at
        FROM link_clicks
        WHERE profile_id = ${profile.id}::uuid AND created_at >= ${thirtyDaysAgo}
        GROUP BY platform, slug
        ORDER BY count DESC
        LIMIT 50
      `,
      prisma.$queryRaw<{ platform: string; slug: string | null; count: bigint }[]>`
        SELECT platform, slug, COUNT(DISTINCT CASE WHEN visitor_id IS NOT NULL THEN visitor_id ELSE ip || '|' || COALESCE(user_agent, '') END) as count
        FROM link_clicks
        WHERE profile_id = ${profile.id}::uuid AND created_at >= ${thirtyDaysAgo}
        GROUP BY platform, slug
        ORDER BY count DESC
        LIMIT 50
      `,
    ]);

  res.json({
    success: true,
    data: {
      total: { views: totalViews, uniqueViews: Number(uniqueViewsAll[0]?.count ?? 0), clicks: totalClicks, uniqueClicks: Number(uniqueClicksAll[0]?.count ?? 0) },
      last30d: { views: viewsLast30d, uniqueViews: Number(uniqueViews30d[0]?.count ?? 0), clicks: clicksLast30d, uniqueClicks: Number(uniqueClicks30d[0]?.count ?? 0) },
      last7d: { views: viewsLast7d, uniqueViews: Number(uniqueViews7d[0]?.count ?? 0), clicks: clicksLast7d, uniqueClicks: Number(uniqueClicks7d[0]?.count ?? 0) },
      last24h: { views: viewsLast24h, uniqueViews: Number(uniqueViews24h[0]?.count ?? 0), clicks: clicksLast24h, uniqueClicks: Number(uniqueClicks24h[0]?.count ?? 0) },
      viewsByDay: viewsByDay.map((r: { date: string; count: bigint }) => ({ date: r.date, count: Number(r.count) })),
      uniqueViewsByDay: uniqueViewsByDay.map((r: { date: string; count: bigint }) => ({ date: r.date, count: Number(r.count) })),
      clicksByDay: clicksByDay.map((r: { date: string; count: bigint }) => ({ date: r.date, count: Number(r.count) })),
      uniqueClicksByDay: uniqueClicksByDay.map((r: { date: string; count: bigint }) => ({ date: r.date, count: Number(r.count) })),
      clicksByPlatform: clicksByPlatform.map((r: { platform: string; count: bigint }) => ({ platform: r.platform, count: Number(r.count) })),
      uniqueClicksByPlatform: uniqueClicksByPlatform.map((r: { platform: string; count: bigint }) => ({ platform: r.platform, count: Number(r.count) })),
      topReferrers: topReferrers.map((r: { referer: string; count: bigint }) => ({ referer: r.referer, count: Number(r.count) })),
      viewsByHour: viewsByHour.map((r: { hour: string; count: bigint }) => ({ hour: r.hour, count: Number(r.count) })),
      uniqueViewsByHour: uniqueViewsByHour.map((r: { hour: string; count: bigint }) => ({ hour: r.hour, count: Number(r.count) })),
      clicksByHour: clicksByHour.map((r: { hour: string; count: bigint }) => ({ hour: r.hour, count: Number(r.count) })),
      uniqueClicksByHour: uniqueClicksByHour.map((r: { hour: string; count: bigint }) => ({ hour: r.hour, count: Number(r.count) })),
      clicksByLink: clicksByLink.map((r: { platform: string; slug: string | null; count: bigint; last_clicked_at: Date | null }) => ({
        platform: r.platform,
        slug: r.slug ?? r.platform,
        count: Number(r.count),
        lastClickedAt: r.last_clicked_at ? r.last_clicked_at.toISOString() : null,
      })),
      uniqueClicksByLink: uniqueClicksByLink.map((r: { platform: string; slug: string | null; count: bigint }) => ({
        platform: r.platform,
        slug: r.slug ?? r.platform,
        uniqueCount: Number(r.count),
      })),
    },
  });
});

// Reset per-link click analytics: no slug = reset all, otherwise only the
// matching link (by its slug / label). Requires the same "advanced" tier so
// non-premium users can't blindly wipe their own analytics.
router.delete("/me", requireAuth, requireApiLevel("advanced"), async (req, res) => {
  const profile = await prisma.profile.findFirst({
    where: profileScope(req.userId!, req.query.profileId),
    select: { id: true },
  });

  if (!profile) {
    return res.status(404).json({ success: false, error: "Profile not found" });
  }

  const slug = typeof req.query.slug === "string" && req.query.slug.trim() ? req.query.slug.trim().slice(0, 64) : null;

  const result = await prisma.linkClick.deleteMany({
    where: {
      profileId: profile.id,
      ...(slug ? { slug } : {}),
    },
  });

  res.json({ success: true, data: { deleted: result.count, slug } });
});

export default router;
