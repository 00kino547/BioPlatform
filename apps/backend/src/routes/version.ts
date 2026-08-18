import { Router, type NextFunction, type Request, type Response } from "express";
import { getVersionCheck } from "../lib/versionCheck.js";
import { requireAuth } from "../middleware/auth.js";
import { requireAdmin } from "../middleware/admin.js";

const router = Router();

const rateLimit = new Map<string, number[]>();
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 6;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const timestamps = rateLimit.get(ip) ?? [];
  const recent = timestamps.filter((t) => now - t < RATE_WINDOW_MS);
  if (recent.length >= RATE_MAX) return false;
  recent.push(now);
  rateLimit.set(ip, recent);
  return true;
}

setInterval(() => {
  const now = Date.now();
  for (const [ip, timestamps] of rateLimit) {
    const recent = timestamps.filter((t) => now - t < RATE_WINDOW_MS);
    if (recent.length === 0) rateLimit.delete(ip);
    else rateLimit.set(ip, recent);
  }
}, RATE_WINDOW_MS).unref?.();

router.get("/", async (req: Request, res: Response, next: NextFunction) => {
  if (req.query.force === "1") {
    next();
    return;
  }
  const ip = (req.ip ?? req.socket.remoteAddress ?? "unknown").replace(/^::ffff:/, "");
  if (!checkRateLimit(ip)) {
    res.status(429).json({ success: false, error: "Too many requests" });
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
