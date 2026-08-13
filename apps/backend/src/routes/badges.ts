import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { contentEtag, clientHasFreshBody } from "../lib/httpCache.js";

const router = Router();

router.get("/", async (req, res) => {
  const badges = await prisma.badge.findMany({
    orderBy: [{ isSystem: "desc" }, { label: "asc" }],
    select: { id: true, slug: true, label: true, color: true, icon: true, isSystem: true },
  });
  const body = { success: true, data: badges };
  const etag = contentEtag(body);
  res.setHeader("ETag", etag);
  res.setHeader("Cache-Control", "public, max-age=300");
  if (clientHasFreshBody(req, etag)) {
    return res.status(304).end();
  }
  res.json(body);
});

export default router;
