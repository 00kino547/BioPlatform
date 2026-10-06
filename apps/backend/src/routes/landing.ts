import { Router, type Request, type Response } from "express";
import { getFeaturedProfileUsername } from "../lib/landingConfig.js";

const router = Router();

router.get("/config", async (_req: Request, res: Response) => {
  try {
    const featuredProfileUsername = await getFeaturedProfileUsername();
    res.setHeader("Cache-Control", "public, max-age=60");
    res.json({ success: true, data: { featuredProfileUsername } });
  } catch {
    res.setHeader("Cache-Control", "no-store");
    res.status(500).json({ success: false, error: "Landing config unavailable" });
  }
});

export default router;