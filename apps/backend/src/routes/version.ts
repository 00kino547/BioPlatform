import { Router, type NextFunction, type Request, type Response } from "express";
import { getVersionCheck } from "../lib/versionCheck.js";
import { requireAuth } from "../middleware/auth.js";
import { requireAdmin } from "../middleware/admin.js";

const router = Router();

router.get("/", async (req: Request, res: Response, next: NextFunction) => {
  if (req.query.force === "1") {
    next();
    return;
  }
  try {
    const data = await getVersionCheck(false);
    res.json({ success: true, data });
  } catch {
    res.status(500).json({ success: false, error: "Version check failed" });
  }
});

router.get("/", requireAuth, requireAdmin, async (_req: Request, res: Response) => {
  try {
    const data = await getVersionCheck(true);
    res.json({ success: true, data });
  } catch {
    res.status(500).json({ success: false, error: "Version check failed" });
  }
});

export default router;
