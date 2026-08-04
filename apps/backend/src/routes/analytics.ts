import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.get("/me", requireAuth, async (req, res) => {
  const profile = await prisma.profile.findUnique({
    where: { userId: req.userId! },
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

  const viewsByDay = await prisma.$queryRaw<{ date: string; count: bigint }[]>`
    SELECT DATE(created_at) as date, COUNT(*) as count
    FROM page_views
    WHERE profile_id = ${profile.id} AND created_at >= ${thirtyDaysAgo}
    GROUP BY DATE(created_at)
    ORDER BY date ASC
  `;

  const clicksByDay = await prisma.$queryRaw<{ date: string; count: bigint }[]>`
    SELECT DATE(created_at) as date, COUNT(*) as count
    FROM link_clicks
    WHERE profile_id = ${profile.id} AND created_at >= ${thirtyDaysAgo}
    GROUP BY DATE(created_at)
    ORDER BY date ASC
  `;

  const clicksByPlatform = await prisma.$queryRaw<{ platform: string; count: bigint }[]>`
    SELECT platform, COUNT(*) as count
    FROM link_clicks
    WHERE profile_id = ${profile.id} AND created_at >= ${thirtyDaysAgo}
    GROUP BY platform
    ORDER BY count DESC
  `;

  const topReferrers = await prisma.$queryRaw<{ referer: string; count: bigint }[]>`
    SELECT COALESCE(referer, 'Direct') as referer, COUNT(*) as count
    FROM page_views
    WHERE profile_id = ${profile.id} AND created_at >= ${thirtyDaysAgo}
    GROUP BY referer
    ORDER BY count DESC
    LIMIT 5
  `;

  res.json({
    success: true,
    data: {
      total: { views: totalViews, clicks: totalClicks },
      last30d: { views: viewsLast30d, clicks: clicksLast30d },
      last7d: { views: viewsLast7d, clicks: clicksLast7d },
      last24h: { views: viewsLast24h, clicks: clicksLast24h },
      viewsByDay: viewsByDay.map((r) => ({ date: r.date, count: Number(r.count) })),
      clicksByDay: clicksByDay.map((r) => ({ date: r.date, count: Number(r.count) })),
      clicksByPlatform: clicksByPlatform.map((r) => ({ platform: r.platform, count: Number(r.count) })),
      topReferrers: topReferrers.map((r) => ({ referer: r.referer, count: Number(r.count) })),
    },
  });
});

export default router;
