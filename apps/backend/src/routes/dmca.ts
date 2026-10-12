// Public DMCA surface, mounted at /api/dmca.
//
//   POST /api/dmca         — anonymous or signed-in filing of a takedown notice
//   GET  /api/dmca/status  — the caller's own disabled/appeal state + reports
//                            THEY filed (authenticated)
//   POST /api/dmca/appeal  — a disabled account holder's appeal (authenticated)
//
// Both authenticated endpoints are exempt from the disabled-account gate in
// middleware/auth.ts (and from the consent gate in middleware/consent.ts): an
// appeal that the 423 it produces would itself block is not an appeal. They are
// NOT public — they run behind requireAuth, so every response is scoped to the
// caller. There is deliberately no "look up anyone's report by id" endpoint.

import { Router, type NextFunction, type Request, type Response } from "express";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { getEnv } from "../config/env.js";
import { requireAuth } from "../middleware/auth.js";
import { DMCA_REPORT_MAX, DMCA_APPEAL_MAX, DMCA_NOTE_MAX } from "../lib/dmca.config.js";
import {
  TakedownValidationError,
  disabledStateFor,
  dmcaAppealRateAllowed,
  dmcaIntakeEnabled,
  dmcaIntakeRateAllowed,
  notifyOperatorOfDmca,
  sanitizeDmcaText,
  sanitizeDmcaUrlList,
  submitAppeal,
} from "../lib/dmca.js";
import { verifyCaptcha } from "../lib/captcha.js";

const router = Router();

/* ---------------------------------------------------------------------------
 * Schemas
 * ------------------------------------------------------------------------- */

/**
 * The three statements 17 U.S.C. § 512(c)(3)(A) requires a notification to
 * contain, plus the signature. They are required here — not merely collected —
 * because a notice missing them is not a valid takedown notice, and an operator
 * should find out at intake rather than after acting on it.
 */
const submitSchema = z.object({
  claimantName: z.string().trim().min(1, "Your name is required").max(200),
  claimantEmail: z.string().trim().email("A valid e-mail address is required").max(254),
  /** URL of the copyrighted work the claimant says is being infringed. */
  workUrl: z.string().trim().min(1, "A URL for the work you are claiming is required").max(2048),
  description: z
    .string()
    .trim()
    .min(1, "Describe the work and the infringement")
    .max(DMCA_REPORT_MAX, `Description must be ${DMCA_REPORT_MAX} characters or fewer`),
  /** Each reported location on this platform. */
  infringingUrls: z.array(z.string().max(2048)).max(20).default([]),
  /** Optional extra context from the claimant. */
  contactNote: z.string().trim().max(DMCA_NOTE_MAX).optional(),
  /**
   * § 512(c)(3)(A)(ii) — good-faith belief that the use is unauthorised.
   *
   * Expressed as `z.boolean().refine()` rather than `z.literal(true)`: a literal
   * mismatch is reported by zod as `invalid_literal` ("Invalid literal value,
   * expected true"), whose message neither `invalid_type_error` nor
   * `required_error` overrides. The claimant needs to be told WHICH statement
   * they failed to tick, not handed the parser's internals.
   */
  goodFaith: z
    .boolean({
      required_error: "You must confirm the good-faith belief statement",
      invalid_type_error: "You must confirm the good-faith belief statement",
    })
    .refine((v) => v === true, { message: "You must confirm the good-faith belief statement" }),
  /** § 512(c)(3)(A)(v) — accuracy under penalty of perjury. */
  accurate: z
    .boolean({
      required_error: "You must confirm the accuracy statement",
      invalid_type_error: "You must confirm the accuracy statement",
    })
    .refine((v) => v === true, { message: "You must confirm the accuracy statement" }),
  /** § 512(c)(3)(A)(vi) — the claimant's physical or electronic signature. */
  signature: z.string().trim().min(2, "Type your full name as your signature").max(200),
  captchaToken: z.string().max(4096).optional(),
});

const appealSchema = z.object({
  text: z
    .string()
    .trim()
    .min(1, "Tell us why the takedown was a mistake")
    .max(DMCA_APPEAL_MAX, `Appeal must be ${DMCA_APPEAL_MAX} characters or fewer`),
});

/* ---------------------------------------------------------------------------
 * Helpers
 * ------------------------------------------------------------------------- */

/**
 * The attestation block appended to every stored notice.
 *
 * It is composed here rather than stored as separate columns so that the report
 * row is self-contained: an operator reading it — or exporting it — sees the
 * exact statements the claimant agreed to, in the wording of the statute,
 * together with the signature and the filing time. The reserve is subtracted
 * from the claimant's own description budget so the pair always fits the
 * `description` column cap.
 */
const ATTESTATION_RESERVE = 700;

function buildNotice(description: string, attestation: { signature: string }): string {
  const filedAt = new Date().toISOString();
  return [
    description,
    "",
    "---",
    "Attestation under 17 U.S.C. 512(c)(3):",
    "- Good-faith belief: I have a good faith belief that the use of the material",
    "  complained of is not authorised by the copyright owner, its agent, or the law.",
    "- Accuracy: The information in this notification is accurate, and under penalty",
    "  of perjury I am the owner of an exclusive right that is allegedly infringed,",
    "  or authorised to act on behalf of such owner.",
    `- Signature: ${attestation.signature} (electronic signature)`,
    `- Filed: ${filedAt}`,
  ].join("\n");
}

/**
 * Identifies the caller when a bearer token is present, but never rejects.
 *
 * A filing is a public action: an anonymous visitor must be able to submit one,
 * while a signed-in one is attributed to their account (DmcaReport.filedByUserId
 * and a readable contact note). Deliberately does NOT apply the disabled or
 * consent gates — those belong to `requireAuth`, and a locked account filing a
 * report against itself changes nothing about who may speak to the operator.
 */
function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    try {
      const payload = jwt.verify(header.slice(7), getEnv().JWT_SECRET) as { userId: string; purpose?: string };
      if (payload.purpose === "auth") req.userId = payload.userId;
    } catch {
      // fall through as anonymous
    }
  }
  next();
}

/** Zod's first issue is the one the user can act on; surface only that. */
function firstIssue(res: { success: boolean; error?: { issues: { message: string }[] } }): string | null {
  return res.success ? null : res.error?.issues[0]?.message ?? "Invalid request";
}

/* ---------------------------------------------------------------------------
 * POST /api/dmca — public intake
 * ------------------------------------------------------------------------- */

router.post("/", optionalAuth, async (req: Request, res: Response) => {
  // The operator can close intake entirely (public.policy.dmca.intakeEnabled).
  // Checked before anything else so a closed instance does not spend rate-limit
  // budget or captcha round-trips on filings it will never accept.
  if (!dmcaIntakeEnabled()) {
    return res.status(403).json({
      success: false,
      code: "dmca_intake_disabled",
      error: "This instance is not accepting new takedown reports right now.",
    });
  }

  const ip = req.ip ?? "unknown";

  // Counted BEFORE validation: an attacker hammering malformed bodies must not
  // get unlimited attempts just because none of them parse.
  const rate = dmcaIntakeRateAllowed(ip);
  if (!rate.allowed) {
    const retryAfterSec = Math.ceil(rate.retryAfterMs / 1000);
    res.setHeader("Retry-After", String(retryAfterSec));
    return res.status(429).json({
      success: false,
      code: "dmca_rate_limited",
      error: `Too many reports from this address. Try again in ${retryAfterSec} seconds.`,
      retryAfterSeconds: retryAfterSec,
    });
  }

  const parsed = submitSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: firstIssue(parsed) });
  }

  // verifyCaptcha short-circuits to success when no provider is configured, so
  // this enforces CAPTCHA exactly when the instance has one and never otherwise.
  const captcha = await verifyCaptcha(parsed.data.captchaToken, ip);
  if (!captcha.success) {
    return res.status(400).json({ success: false, error: captcha.error ?? "Captcha verification failed" });
  }

  const input = parsed.data;
  const description = sanitizeDmcaText(input.description, DMCA_REPORT_MAX - ATTESTATION_RESERVE);
  const infringingUrls = sanitizeDmcaUrlList(input.infringingUrls);

  // Resolve the signed-in filer to a readable name for the operator's note.
  const filer = req.userId
    ? await prisma.user.findUnique({ where: { id: req.userId }, select: { id: true, username: true } })
    : null;

  const report = await prisma.dmcaReport.create({
    data: {
      claimantName: sanitizeDmcaText(input.claimantName, 200),
      claimantEmail: input.claimantEmail.trim().slice(0, 254),
      workUrl: sanitizeDmcaText(input.workUrl, 2048),
      description: buildNotice(description, { signature: sanitizeDmcaText(input.signature, 200) }),
      infringingUrls,
      contactNote: input.contactNote
        ? sanitizeDmcaText(input.contactNote, DMCA_NOTE_MAX)
        : filer
          ? `Filed while signed in as ${filer.username}`
          : "Filed anonymously",
      // Set when a signed-in user files; otherwise NULL (anonymous report).
      filedByUserId: filer?.id ?? null,
    },
    select: { id: true, status: true, createdAt: true },
  });

  // Best-effort: a SMTP failure must not lose the report that was just filed.
  void notifyOperatorOfDmca({
    id: report.id,
    claimantName: input.claimantName,
    workUrl: input.workUrl,
    description,
    infringingUrls,
    createdAt: report.createdAt,
  }).catch(() => undefined);

  return res.status(201).json({ success: true, data: report });
});

/* ---------------------------------------------------------------------------
 * GET /api/dmca/status — the caller's own picture
 * ------------------------------------------------------------------------- */

router.get("/status", requireAuth, async (req: Request, res: Response) => {
  const userId = req.userId!;

  // Read through the same helper the 423 gate and /me use, so the appeal screen
  // and the API can never disagree about why an account is locked.
  const disabled = await disabledStateFor(userId);

  // ONLY reports this account filed. `decisionNote` and `counterNotice` are
  // deliberately omitted: both are operator / counter-party text, not the
  // claimant's own submission.
  const reports = await prisma.dmcaReport.findMany({
    where: { filedByUserId: userId },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      status: true,
      workUrl: true,
      createdAt: true,
      handledAt: true,
      infringingUrls: true,
    },
  });

  res.json({ success: true, data: { disabled, reports } });
});

/* ---------------------------------------------------------------------------
 * POST /api/dmca/appeal — the disabled account's way out
 * ------------------------------------------------------------------------- */

router.post("/appeal", requireAuth, async (req: Request, res: Response) => {
  const userId = req.userId!;

  const rate = dmcaAppealRateAllowed(userId);
  if (!rate.allowed) {
    const retryAfterSec = Math.ceil(rate.retryAfterMs / 1000);
    res.setHeader("Retry-After", String(retryAfterSec));
    return res.status(429).json({
      success: false,
      code: "dmca_rate_limited",
      error: `Too many appeal submissions. Try again in ${retryAfterSec} seconds.`,
      retryAfterSeconds: retryAfterSec,
    });
  }

  const parsed = appealSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: firstIssue(parsed) });
  }

  try {
    await submitAppeal(userId, parsed.data.text);
  } catch (error) {
    // Thrown for "not disabled" and "empty text" — both are the caller's state,
    // not a server fault, so they are a 4xx and never a 500.
    if (error instanceof TakedownValidationError) {
      return res.status(400).json({ success: false, error: error.message });
    }
    throw error;
  }

  res.json({
    success: true,
    data: {
      appealSubmittedAt: new Date(),
      appealText: sanitizeDmcaText(parsed.data.text, DMCA_APPEAL_MAX),
    },
  });
});

export default router;
