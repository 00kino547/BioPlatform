import { Router, type Request, type Response } from "express";
import { getEnv } from "../config/env.js";
import { getPublicInstanceConfig, type PublicInstanceConfig } from "../lib/instanceConfig.js";

const router = Router();

/**
 * GET /api/config — the PUBLIC part of the instance config.
 *
 * Purely static once loaded (boot-time read, no DB). `private` is never
 * serialized here. The landing hero/footer, the announcement bar and
 * hidePricing are all driven by this payload. `ads` is present only while the
 * operator enabled it, and the free-tier opt-out grant is derived from the
 * ADS_FREE_OPT_OUT_ALLOWED env on every request so a running backend can't
 * serve stale grants.
 */
router.get("/", (_req: Request, res: Response) => {
  res.setHeader("Cache-Control", "public, max-age=60");
  const publicConfig: PublicInstanceConfig = getPublicInstanceConfig();
  const data =
    publicConfig.ads.enabled === true
      ? {
          ...publicConfig,
          ads: { ...publicConfig.ads, freeOptOutAllowed: getEnv().ADS_FREE_OPT_OUT_ALLOWED },
        }
      : publicConfig;
  res.json({ success: true, data });
});

export default router;