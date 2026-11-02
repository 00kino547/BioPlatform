import { Router, type Request, type Response } from "express";
import { getPublicInstanceConfig } from "../lib/instanceConfig.js";

const router = Router();

/**
 * i18n API.
 *
 * The multi-language UI is driven entirely by the `public.i18n` block in
 * config.yml, which is validated once (`lib/instanceConfig.ts`) and can hot-reload
 * without a restart. The translation files themselves are frontend bundle assets
 * (apps/frontend/src/locales/{lng}/*.json) and are NEVER served from the backend —
 * these endpoints only expose the switch + locale set the UI must honour.
 *
 * Contract:
 *   GET /api/i18n/config   -> { success, data: { enabled, defaultLocale,
 *                              fallbackLocale, locales } }  (mirror of the
 *                              config.yml `public.i18n` block; the same data
 *                              also flows through GET /api/config)
 *   GET /api/i18n/locales  -> { success, data: { defaultLocale,
 *                              fallbackLocale, locales } }  (the locale set the
 *                              UI may offer; `enabled` is intentionally omitted
 *                              because a locale list is only meaningful once the
 *                              feature is on, which the caller reads from
 *                              /config)
 *
 * Both answers are `no-store`: the block hot-reloads, so a cached locale list
 * could outlive an operator's config edit.
 */

/**
 * GET /api/i18n/config — the instance's i18n switch + locale set. Mirrors the
 * `public.i18n` section that also flows through GET /api/config; exposed here so
 * the UI can poll the feature state without pulling the whole config payload.
 * `enabled: false` is a valid 200 (the feature is off, not an error) — the
 * frontend stays inert until an operator flips it.
 */
router.get("/config", (_req: Request, res: Response) => {
  res.setHeader("Cache-Control", "no-store");
  const { enabled, defaultLocale, fallbackLocale, locales } = getPublicInstanceConfig().i18n;
  res.json({ success: true, data: { enabled, defaultLocale, fallbackLocale, locales } });
});

/**
 * GET /api/i18n/locales — the locale set the UI may offer the visitor. Same
 * source block as `/config` minus the master switch; both read `public.i18n`
 * live so a config edit is visible on the next request.
 */
router.get("/locales", (_req: Request, res: Response) => {
  res.setHeader("Cache-Control", "no-store");
  const { defaultLocale, fallbackLocale, locales } = getPublicInstanceConfig().i18n;
  res.json({ success: true, data: { defaultLocale, fallbackLocale, locales } });
});

export default router;
