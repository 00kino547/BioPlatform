import { Router } from "express";
import { prisma } from "../lib/prisma.js";

const router = Router();

router.get("/", async (_req, res) => {
  const badges = await prisma.badge.findMany({
    orderBy: [{ isSystem: "desc" }, { label: "asc" }],
    select: { id: true, slug: true, label: true, color: true, icon: true, isSystem: true },
  });
  res.json({ success: true, data: badges });
});

export default router;
