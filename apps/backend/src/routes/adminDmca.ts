// Admin → Moderation: DMCA report review, media search, hash bans and the
// disabled-account queue.
//
// Mounted from routes/admin.ts as `router.use("/dmca", …)` AFTER that router's
// `requireAuth, requireAdmin` pair, so it inherits both; every handler here is
// additionally scoped to `moderation.manage`. Nothing in this file re-implements
// review logic — the decisions live in lib/dmca.ts so the public intake, the
// admin routes and the purge job cannot drift:
//
//   dismiss           -> dismissReport()         record + e-mail the claimant
//   takedown          -> execTakedown()          remove files, ban hashes, disable
//   counter-notice    -> recordCounterNotice()   lift bans, NO auto re-activation
//   delete report     -> deleteReport()          lift bans first, then the row
//   re-activate       -> reactivateAccount()     clears the appeal record
//
// The operator picks takedown targets from `GET /dmca/media` and confirms them;
// expansion to same-hash copies is `execTakedown`'s job, not the route's.

import { Router, type Request, type Response } from "express";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { PERMISSIONS } from "../lib/permissions.js";
import { requirePermission } from "../middleware/admin.js";
import { requireNoUpdateLockdown } from "../lib/versionCheck.js";
import {
  TakedownConflictError,
  TakedownValidationError,
  banHash,
  deleteReport,
  disableAccount,
  dismissReport,
  execTakedown,
  reactivateAccount,
  recordCounterNotice,
  removeMediaFile,
  takedownAllMediaOfUser,
} from "../lib/dmca.js";

const router = Router();

/** Everything downstream of this router requires moderation rights. */
router.use(requirePermission(PERMISSIONS.MODERATION_MANAGE));

const DEFAULT_PAGE_LIMIT = 50;

/** Postgres `uuid` columns reject a non-uuid string, so an id-or-slug/username
 * lookup only includes the `id` branch when the identifier is actually a uuid. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_PAGE_LIMIT = 100;

/**
 * Local copy of admin.ts's pagination helper. Deliberately not imported from
 * there: adminDmca is mounted BY admin.ts, and importing back would put a cycle
 * in the module graph for the sake of eight lines.
 */
function paginationParams(query: Request["query"]) {
  const rawLimit = typeof query.limit === "string" ? Number.parseInt(query.limit, 10) : Number.NaN;
  const rawOffset = typeof query.offset === "string" ? Number.parseInt(query.offset, 10) : Number.NaN;
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), MAX_PAGE_LIMIT) : DEFAULT_PAGE_LIMIT;
  const offset = Number.isFinite(rawOffset) ? Math.max(rawOffset, 0) : 0;
  return { take: limit, skip: offset, limit, offset };
}

const REPORT_STATUSES = ["NEW", "TAKEN_DOWN", "DISMISSED", "COUNTER_NOTICE"] as const;
const MEDIA_KINDS = ["AVATAR", "BANNER", "LINK_ICON", "BACKGROUND", "MUSIC", "SHOP_PREVIEW", "SHOP_PRODUCT"] as const;

/** Shared 400/409 for everything lib/dmca.ts refuses to do. */
function validationError(res: Response, err: unknown): boolean {
  if (err instanceof TakedownValidationError) {
    res.status(400).json({ success: false, error: err.message });
    return true;
  }
  if (err instanceof TakedownConflictError) {
    res.status(409).json({ success: false, error: err.message });
    return true;
  }
  return false;
}

/** Parse a `?from=` / `?to=` date bound, rejecting nonsense with a 400. */
function dateBound(value: unknown): Date | undefined | "invalid" {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "invalid" : parsed;
}

/* ---------------------------------------------------------------------------
 * Reports
 * ------------------------------------------------------------------------- */

router.get("/reports", async (req, res) => {
  const { take, skip, limit, offset } = paginationParams(req.query);

  const status = typeof req.query.status === "string" && req.query.status ? req.query.status : undefined;
  if (status && !(REPORT_STATUSES as readonly string[]).includes(status)) {
    return res.status(400).json({ success: false, error: "Unknown report status" });
  }
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const from = dateBound(req.query.from);
  const to = dateBound(req.query.to);
  if (from === "invalid" || to === "invalid") {
    return res.status(400).json({ success: false, error: "Invalid date filter" });
  }

  const where: Prisma.DmcaReportWhereInput = {};
  if (status) where.status = status as Prisma.EnumDmcaStatusFilter["equals"];
  if (q) {
    where.OR = [
      { claimantName: { contains: q, mode: "insensitive" } },
      { claimantEmail: { contains: q, mode: "insensitive" } },
      { workUrl: { contains: q, mode: "insensitive" } },
    ];
  }
  if (from || to) {
    where.createdAt = { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };
  }

  const [reports, total, grouped] = await Promise.all([
    prisma.dmcaReport.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take,
      skip,
      select: {
        id: true,
        status: true,
        claimantName: true,
        claimantEmail: true,
        workUrl: true,
        createdAt: true,
        handledAt: true,
        counterNoticeAt: true,
        filedByUser: { select: { username: true } },
        // Active bans only: an unbanned hash is history, not live exposure.
        _count: { select: { hashes: { where: { unbannedAt: null } } } },
      },
    }),
    prisma.dmcaReport.count({ where }),
    prisma.dmcaReport.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);

  const counts: Record<string, number> = { NEW: 0, TAKEN_DOWN: 0, DISMISSED: 0, COUNTER_NOTICE: 0 };
  for (const row of grouped) counts[row.status] = row._count._all;

  res.json({
    success: true,
    data: reports.map((r) => ({
      id: r.id,
      status: r.status,
      claimantName: r.claimantName,
      claimantEmail: r.claimantEmail,
      workUrl: r.workUrl,
      createdAt: r.createdAt,
      handledAt: r.handledAt,
      counterNoticeAt: r.counterNoticeAt,
      filedBy: r.filedByUser?.username ?? null,
      activeHashes: r._count.hashes,
    })),
    counts,
    pagination: { total, limit, offset },
  });
});

router.get("/reports/:id", async (req: Request<{ id: string }>, res) => {
  const report = await prisma.dmcaReport.findUnique({
    where: { id: req.params.id },
    select: {
      id: true,
      status: true,
      claimantName: true,
      claimantEmail: true,
      workUrl: true,
      description: true,
      infringingUrls: true,
      contactNote: true,
      createdAt: true,
      handledAt: true,
      decisionNote: true,
      counterNotice: true,
      counterNoticeAt: true,
      filedByUser: { select: { id: true, username: true } },
      handledBy: { select: { id: true, username: true } },
      hashes: { orderBy: { bannedAt: "desc" } },
    },
  });
  if (!report) return res.status(404).json({ success: false, error: "Report not found" });

  res.json({ success: true, data: report });
});

router.post("/reports/:id/dismiss", async (req: Request<{ id: string }>, res) => {
  const parsed = z.object({ note: z.string().max(1000).optional() }).safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ success: false, error: "Invalid request body" });

  try {
    await dismissReport(req.params.id, req.userId!, parsed.data.note ?? "");
  } catch (err) {
    if (validationError(res, err)) return;
    throw err;
  }
  res.json({ success: true, message: "Report dismissed" });
});

/**
 * The takedown itself. The operator confirms the selection here; expansion to
 * every other account's copy of the same bytes happens inside `execTakedown`.
 */
router.post(
  "/reports/:id/takedown",
  requireNoUpdateLockdown,
  async (req: Request<{ id: string }>, res) => {
    const parsed = z
      .object({
        mediaFileIds: z
          .array(z.string().min(1))
          .min(1, "Select at least one file to take down.")
          .max(500),
        note: z.string().max(1000).optional(),
        disableAccount: z.boolean().optional(),
      })
      .safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: parsed.error.issues[0]?.message ?? "Invalid request body",
      });
    }

    try {
      const result = await execTakedown({
        mediaFileIds: parsed.data.mediaFileIds,
        reportId: req.params.id,
        note: parsed.data.note,
        disableAccount: parsed.data.disableAccount,
        adminId: req.userId!,
      });
      res.json({ success: true, data: result });
    } catch (err) {
      if (validationError(res, err)) return;
      throw err;
    }
  }
);

/**
 * Report-less takedown: an operator removes content with no filed report.
 * Full takedown semantics — every copy of the selected bytes across all accounts
 * is deleted and its hash banned. Accounts are disabled only when the operator
 * explicitly asks (`disableAccount: true`); unlike the DMCA flow the default is
 * OFF, because a manual content ban should not silently lock people out.
 */
router.post("/takedown", requireNoUpdateLockdown, async (req, res) => {
  const parsed = z
    .object({
      mediaFileIds: z.array(z.string().min(1)).min(1, "Select at least one file to take down.").max(500),
      note: z.string().max(1000).optional(),
      disableAccount: z.boolean().optional(),
    })
    .safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: parsed.error.issues[0]?.message ?? "Invalid request body" });
  }

  try {
    const result = await execTakedown({
      mediaFileIds: parsed.data.mediaFileIds,
      note: parsed.data.note,
      disableAccount: parsed.data.disableAccount === true,
      // The note doubles as the recorded reason on each manual ban.
      reason: parsed.data.note || "manual",
      adminId: req.userId!,
    });
    res.json({ success: true, data: result });
  } catch (err) {
    if (validationError(res, err)) return;
    throw err;
  }
});

/** Record the reported party's counter-notice: bans go, accounts stay down. */
router.post("/reports/:id/counter-notice", async (req: Request<{ id: string }>, res) => {
  const parsed = z
    .object({ text: z.string().min(1, "Counter-notice text is required.").max(2000) })
    .safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid request body",
    });
  }

  try {
    await recordCounterNotice(req.params.id, parsed.data.text, req.userId!);
  } catch (err) {
    if (validationError(res, err)) return;
    throw err;
  }
  res.json({ success: true, message: "Counter-notice recorded and hash bans lifted" });
});

/** Hard delete. Lifts the report's bans first — see deleteReport(). */
router.delete("/reports/:id", requireNoUpdateLockdown, async (req: Request<{ id: string }>, res) => {
  try {
    const result = await deleteReport(req.params.id, req.userId!);
    res.json({ success: true, data: result });
  } catch (err) {
    if (validationError(res, err)) return;
    throw err;
  }
});

/* ---------------------------------------------------------------------------
 * Media search — how the operator finds what to take down
 * ------------------------------------------------------------------------- */

router.get("/media", async (req, res) => {
  const { take, skip, limit, offset } = paginationParams(req.query);

  const sha256 = typeof req.query.sha256 === "string" ? req.query.sha256.trim().toLowerCase() : "";
  const pHash = typeof req.query.pHash === "string" ? req.query.pHash.trim().toLowerCase() : "";
  const username = typeof req.query.username === "string" ? req.query.username.trim() : "";
  const userId = typeof req.query.userId === "string" ? req.query.userId.trim() : "";
  const profileId = typeof req.query.profileId === "string" ? req.query.profileId.trim() : "";
  const kindRaw = typeof req.query.kind === "string" ? req.query.kind : "";
  const from = dateBound(req.query.from);
  const to = dateBound(req.query.to);
  if (from === "invalid" || to === "invalid") {
    return res.status(400).json({ success: false, error: "Invalid date filter" });
  }
  if (kindRaw && !(MEDIA_KINDS as readonly string[]).includes(kindRaw)) {
    return res.status(400).json({ success: false, error: "Unknown media kind" });
  }

  const where: Prisma.MediaFileWhereInput = {};
  if (sha256) where.sha256 = sha256;
  if (pHash) where.pHashHex = pHash;
  if (kindRaw) where.kind = kindRaw as Prisma.EnumMediaKindFilter["equals"];
  if (userId) where.userId = userId;
  if (profileId) where.profileId = profileId;
  if (username) where.user = { username: { equals: username, mode: "insensitive" } };
  if (from || to) where.createdAt = { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };

  const [files, total] = await Promise.all([
    prisma.mediaFile.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take,
      skip,
      select: {
        id: true,
        kind: true,
        sha256: true,
        pHashHex: true,
        filePath: true,
        createdAt: true,
        userId: true,
        profileId: true,
        user: { select: { username: true } },
        profile: { select: { slug: true } },
      },
    }),
    prisma.mediaFile.count({ where }),
  ]);

  // The point of the search: show every account already holding the same bytes
  // so the operator can preview what the automatic expansion will touch.
  const shas = [...new Set(files.map((f) => f.sha256))];
  const [siblings, bans] = await Promise.all([
    shas.length
      ? prisma.mediaFile.findMany({
          where: { sha256: { in: shas } },
          select: { sha256: true, user: { select: { username: true } } },
        })
      : Promise.resolve([]),
    shas.length
      ? prisma.bannedHash.findMany({
          where: { sha256: { in: shas }, unbannedAt: null },
          select: { sha256: true },
        })
      : Promise.resolve([]),
  ]);

  const ownersBySha = new Map<string, Set<string>>();
  for (const row of siblings) {
    const set = ownersBySha.get(row.sha256) ?? new Set<string>();
    if (row.user?.username) set.add(row.user.username);
    ownersBySha.set(row.sha256, set);
  }
  const bannedShas = new Set(bans.map((b) => b.sha256));

  res.json({
    success: true,
    data: files.map((f) => {
      const owners = [...(ownersBySha.get(f.sha256) ?? [])];
      return {
        id: f.id,
        kind: f.kind,
        sha256: f.sha256,
        pHashHex: f.pHashHex,
        filePath: f.filePath,
        createdAt: f.createdAt,
        profileId: f.profileId,
        profileSlug: f.profile?.slug ?? null,
        owner: { userId: f.userId, username: f.user?.username ?? f.userId },
        /** How many accounts hold this exact file (including this one). */
        copyOwners: owners,
        copyCount: siblings.filter((s) => s.sha256 === f.sha256).length,
        banned: bannedShas.has(f.sha256),
      };
    }),
    pagination: { total, limit, offset },
  });
});

/**
 * Delete a single stored media file (object + row + owner reference). No hash
 * ban: this removes one copy only, it does not block the bytes anywhere.
 */
router.delete("/media/:id", requireNoUpdateLockdown, async (req: Request<{ id: string }>, res) => {
  const media = await prisma.mediaFile.findUnique({ where: { id: req.params.id } });
  if (!media) return res.status(404).json({ success: false, error: "Media file not found" });
  await removeMediaFile(media);
  res.json({ success: true, message: "Media file removed" });
});

/**
 * Take down every media file owned by a profile's owner — the "ban a whole
 * profile" action. `:identifier` is a profile id or slug. Expansion to other
 * accounts' copies of the same bytes happens inside `execTakedown`.
 */
router.post("/profiles/:identifier/takedown", requireNoUpdateLockdown, async (req: Request<{ identifier: string }>, res) => {
  const parsed = z
    .object({ note: z.string().max(1000).optional(), disableAccount: z.boolean().optional() })
    .safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: parsed.error.issues[0]?.message ?? "Invalid request body" });
  }

  const identifier = req.params.identifier;
  const profile = await prisma.profile.findFirst({
    where: UUID_RE.test(identifier)
      ? { OR: [{ id: identifier }, { slug: identifier }] }
      : { slug: identifier },
    select: { userId: true },
  });
  if (!profile) return res.status(404).json({ success: false, error: "Profile not found" });

  try {
    const result = await takedownAllMediaOfUser(profile.userId, {
      note: parsed.data.note,
      disableAccount: parsed.data.disableAccount === true,
      reason: parsed.data.note || "manual",
      adminId: req.userId!,
    });
    res.json({ success: true, data: result });
  } catch (err) {
    if (validationError(res, err)) return;
    throw err;
  }
});

/* ---------------------------------------------------------------------------
 * Banned hashes
 * ------------------------------------------------------------------------- */

router.get("/hashes", async (req, res) => {
  const { take, skip, limit, offset } = paginationParams(req.query);

  const activeRaw = typeof req.query.active === "string" ? req.query.active : "";
  if (activeRaw && activeRaw !== "true" && activeRaw !== "false") {
    return res.status(400).json({ success: false, error: "active must be true or false" });
  }
  const where: Prisma.BannedHashWhereInput =
    activeRaw === "true" ? { unbannedAt: null } : activeRaw === "false" ? { unbannedAt: { not: null } } : {};

  const [hashes, total] = await Promise.all([
    prisma.bannedHash.findMany({
      where,
      orderBy: { bannedAt: "desc" },
      take,
      skip,
      select: {
        id: true,
        sha256: true,
        pHashHex: true,
        reason: true,
        bannedAt: true,
        unbannedAt: true,
        dmcaReportId: true,
        bannedBy: { select: { username: true } },
        unbannedBy: { select: { username: true } },
      },
    }),
    prisma.bannedHash.count({ where }),
  ]);

  res.json({
    success: true,
    data: hashes.map((h) => ({ ...h, active: h.unbannedAt === null })),
    pagination: { total, limit, offset },
  });
});

/** Ban a hash directly (no report) — operator judgement or a pre-emptive block. */
router.post("/hashes", requireNoUpdateLockdown, async (req, res) => {
  const parsed = z
    .object({
      sha256: z.string().min(1, "A SHA-256 hash is required."),
      pHashHex: z.string().optional(),
      note: z.string().max(1000).optional(),
    })
    .safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: parsed.error.issues[0]?.message ?? "Invalid request body" });
  }
  try {
    const result = await banHash({
      sha256: parsed.data.sha256,
      pHashHex: parsed.data.pHashHex,
      note: parsed.data.note,
      adminId: req.userId!,
    });
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    if (validationError(res, err)) return;
    throw err;
  }
});

/** Manual unban (false positive / operator judgement), independent of a report. */
router.delete("/hashes/:id", requireNoUpdateLockdown, async (req: Request<{ id: string }>, res) => {
  const hash = await prisma.bannedHash.findUnique({ where: { id: req.params.id }, select: { id: true, unbannedAt: true } });
  if (!hash) return res.status(404).json({ success: false, error: "Hash ban not found" });
  if (hash.unbannedAt) return res.status(409).json({ success: false, error: "This hash is already unbanned" });

  await prisma.bannedHash.update({
    where: { id: req.params.id },
    data: { unbannedAt: new Date(), unbannedById: req.userId! },
  });
  res.json({ success: true, message: "Hash ban lifted" });
});

/* ---------------------------------------------------------------------------
 * Disabled accounts + appeals
 * ------------------------------------------------------------------------- */

router.get("/disabled", async (req, res) => {
  const { take, skip, limit, offset } = paginationParams(req.query);

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where: { disabledAt: { not: null } },
      orderBy: { disabledAt: "desc" },
      take,
      skip,
      select: {
        id: true,
        username: true,
        email: true,
        disabledAt: true,
        disabledReason: true,
        appealSubmittedAt: true,
        appealReviewedAt: true,
        appealDecision: true,
        _count: { select: { dmcaReportsFiled: true } },
      },
    }),
    prisma.user.count({ where: { disabledAt: { not: null } } }),
  ]);

  res.json({
    success: true,
    data: users.map((u) => ({
      id: u.id,
      username: u.username,
      email: u.email,
      disabledAt: u.disabledAt,
      disabledReason: u.disabledReason,
      appealSubmittedAt: u.appealSubmittedAt,
      appealReviewedAt: u.appealReviewedAt,
      appealDecision: u.appealDecision,
      reportsFiled: u._count.dmcaReportsFiled,
    })),
    pagination: { total, limit, offset },
  });
});

/**
 * Disable an account directly (id or username), with no takedown behind it.
 * Reuses the same disabled-account state as a DMCA takedown, so the account
 * cannot sign in, shows in the Disabled accounts queue and can appeal.
 */
router.post("/users/:identifier/disable", requireNoUpdateLockdown, async (req: Request<{ identifier: string }>, res) => {
  const parsed = z
    .object({ reason: z.string().min(1, "A reason is required.").max(1000) })
    .safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: parsed.error.issues[0]?.message ?? "Invalid request body" });
  }

  const identifier = req.params.identifier;
  const user = await prisma.user.findFirst({
    where: UUID_RE.test(identifier)
      ? { OR: [{ id: identifier }, { username: identifier }] }
      : { username: identifier },
    select: { id: true, disabledAt: true },
  });
  if (!user) return res.status(404).json({ success: false, error: "User not found" });
  if (user.disabledAt) return res.status(409).json({ success: false, error: "This account is already disabled" });

  await disableAccount(user.id, parsed.data.reason);
  res.json({ success: true, message: "Account disabled" });
});

/**
 * Re-activate a disabled account. Never automatic: a counter-notice lifts hash
 * bans but leaves the account down until an operator looks at it here.
 */
router.post(
  "/disabled/:id/reactivate",
  requireNoUpdateLockdown,
  async (req: Request<{ id: string }>, res) => {
    const parsed = z
      .object({ decision: z.string().min(1, "A decision note is required.").max(1000) })
      .safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: parsed.error.issues[0]?.message ?? "Invalid request body",
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: { id: true, disabledAt: true },
    });
    if (!user) return res.status(404).json({ success: false, error: "User not found" });
    if (!user.disabledAt) return res.status(400).json({ success: false, error: "This account is not disabled" });

    await reactivateAccount(user.id, parsed.data.decision);
    res.json({ success: true, message: "Account re-activated" });
  }
);

export default router;
