import { Router, type Request, type Response } from "express";
import { getEnv } from "../config/env.js";
import { getCacheDriver } from "../lib/cache.js";
import { getPocketbaseConfig } from "../lib/pocketbase/index.js";

const router = Router();

export interface FeatureFlags {
  linksSections: boolean;
  linksCustomIcons: boolean;
  linksQr: boolean;
  /** Optional PocketBase sign-in provider (the only PocketBase capability). */
  pocketbaseOauth: boolean;
}

function currentFeatureFlags(): FeatureFlags {
  const env = getEnv();
  const pb = getPocketbaseConfig();
  return {
    linksSections: env.LINKS_SECTIONS_ENABLED,
    linksCustomIcons: env.LINKS_CUSTOM_ICONS_ENABLED,
    linksQr: env.LINKS_QR_ENABLED,
    pocketbaseOauth: pb.enabled && pb.oauthEnabled,
  };
}

const FEATURES_TTL_MS = 60_000;

router.get("/", async (_req: Request, res: Response) => {
  try {
    const cache = getCacheDriver();
    const cached = await cache.get("features:public");
    if (cached) {
      res.setHeader("Cache-Control", "public, max-age=60");
      return res.json({ success: true, data: JSON.parse(cached) });
    }
    const flags = currentFeatureFlags();
    await cache.set("features:public", JSON.stringify(flags), FEATURES_TTL_MS);
    res.setHeader("Cache-Control", "public, max-age=60");
    res.json({ success: true, data: flags });
  } catch {
    res.setHeader("Cache-Control", "no-store");
    res.status(500).json({ success: false, error: "Features unavailable" });
  }
});

export default router;