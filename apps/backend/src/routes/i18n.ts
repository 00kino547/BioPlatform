import { Router, type Request, type Response } from "express";

const router = Router();

/**
 * i18n API — STRUCTURE ONLY.
 *
 * Nothing behind these endpoints works yet (and they are intentionally not
 * wired to the config toggle or any translation store). They exist so the
 * endpoint contract is already fixed and the frontend can be written against
 * it before the feature ships. Every route currently answers 503 Service
 * Unavailable with a stable `code` so callers can detect (and UI can surface)
 * "i18n not implemented" distinctly from a real failure.
 *
 * Planned contract (do not drift from these paths):
 *   GET /api/i18n/config   -> { success, data: { enabled, defaultLocale,
 *                              fallbackLocale, locales } }  (mirror of the
 *                              config.yml `public.i18n` block)
 *   GET /api/i18n/locales  -> { success, data: { defaultLocale,
 *                              fallbackLocale, locales } }  (locales the UI
 *                              may offer; files ship with the frontend bundle)
 *
 * No locale-file server is planned: translations are frontend bundle assets
 * (apps/frontend/src/locales/{lng}/*.json), never served from the backend.
 */

/** Every placeholder response shares one stable, machine-readable reason. */
const NOT_IMPLEMENTED = {
  success: false,
  error: "i18n service is not implemented yet",
  code: "i18n_not_implemented",
} as const;

/**
 * GET /api/i18n/config — the instance's i18n switch + locale set, once wired.
 * Structurally this returned value mirrors `public.i18n` from config.yml, which
 * also flows through the existing GET /api/config payload unchanged.
 */
router.get("/config", (_req: Request, res: Response) => {
  res.setHeader("Cache-Control", "no-store");
  res.status(503).json(NOT_IMPLEMENTED);
});

/**
 * GET /api/i18n/locales — the locale set the UI may offer the visitor. Same
 * 503 placeholder state as `/config`; both are unblocked together.
 */
router.get("/locales", (_req: Request, res: Response) => {
  res.setHeader("Cache-Control", "no-store");
  res.status(503).json(NOT_IMPLEMENTED);
});

export default router;