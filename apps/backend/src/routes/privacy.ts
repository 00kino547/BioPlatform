import { Router } from "express";
import { CONSENT_COOKIE, ANALYTICS_COOKIE, consentFromRequest, privacyRequested } from "../lib/privacy.js";

const router = Router();

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

function consentCookieOptions(secure: boolean) {
  return {
    httpOnly: true,
    secure,
    sameSite: "lax" as const,
    path: "/",
    maxAge: ONE_YEAR_MS,
  };
}

router.get("/consent", (req, res) => {
  const consent = consentFromRequest(req.headers);
  const dnt = privacyRequested(req.headers);
  res.json({ success: true, data: { consent, dnt, effective: dnt ? "essential" : consent } });
});

router.post("/consent", (req, res) => {
  const body = req.body as { decision?: unknown };
  const requested = body?.decision;
  if (requested !== "accept" && requested !== "essential") {
    return res.status(400).json({ success: false, error: "decision must be 'accept' or 'essential'" });
  }
  // Do Not Track is a browser default, not a veto, so it is applied where nobody
  // has chosen anything (see the GET above and `effective` below) rather than
  // here. Overriding an explicit choice used to store `essential` while the UI
  // reported `accept`, which left analytics permanently disabled with no way to
  // tell why: the visitor could press "Accept all" forever and nothing changed.
  const dnt = privacyRequested(req.headers);
  const decision = requested;
  res.cookie(CONSENT_COOKIE, decision, consentCookieOptions(req.secure));
  if (decision === "essential") {
    res.clearCookie(ANALYTICS_COOKIE, { path: "/" });
  }
  res.json({ success: true, data: { consent: decision, dnt, effective: decision } });
});

router.post("/consent/revoke", (_req, res) => {
  res.clearCookie(CONSENT_COOKIE, { path: "/" });
  res.clearCookie(ANALYTICS_COOKIE, { path: "/" });
  res.json({ success: true, data: { consent: "unknown" } });
});

export default router;