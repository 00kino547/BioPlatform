import { Router, type Request, type Response, type NextFunction } from "express";
import crypto from "crypto";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { getEnv } from "../config/env.js";
import { hasPermission, PERMISSIONS } from "../lib/permissions.js";
import { stripHtml } from "../lib/validation.js";
import {
  DAY_MS,
  computeInviteAllowance,
  computeSeatInfo,
  countOutstandingInvites,
  getInviteGenerationEnabled,
  roleInviteConfig,
  runInviteRefundSweep,
  allocateInviteCredits,
  remainingCreditsForSource,
} from "../lib/inviteService.js";

const router = Router();

const PUBLIC_LIMIT_WINDOW_MS = 60_000;
const PUBLIC_LIMIT_MAX = 60;
const publicHits = new Map<string, number[]>();

function publicRateLimit(req: Request, res: Response, next: NextFunction) {
  const ip = req.ip ?? "unknown";
  const now = Date.now();
  const cutoff = now - PUBLIC_LIMIT_WINDOW_MS;
  const hits = (publicHits.get(ip) ?? []).filter((t) => t > cutoff);
  if (hits.length >= PUBLIC_LIMIT_MAX) {
    publicHits.set(ip, hits);
    return res.status(429).json({ success: false, error: "Too many requests. Please try again later." });
  }
  hits.push(now);
  publicHits.set(ip, hits);
  next();
}

setInterval(() => {
  const cutoff = Date.now() - PUBLIC_LIMIT_WINDOW_MS;
  for (const [ip, hits] of publicHits) {
    const remaining = hits.filter((t) => t > cutoff);
    if (remaining.length === 0) {
      publicHits.delete(ip);
    } else {
      publicHits.set(ip, remaining);
    }
  }
}, PUBLIC_LIMIT_WINDOW_MS);

const createSchema = z.object({
  count: z.number().int().min(1).max(50).default(1),
  expiresInDays: z.number().int().min(1).max(365).optional(),
});

class InviteHttpError extends Error {
  status: number;
  data?: { retryAfterSeconds?: number };
  constructor(status: number, message: string, retryAfterSeconds?: number) {
    super(message);
    this.status = status;
    if (retryAfterSeconds !== undefined) this.data = { retryAfterSeconds };
  }
}

function serializeCode(c: {
  id: string;
  code: string;
  usedById: string | null;
  usedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
  fromAllowance: boolean;
  note: string | null;
}) {
  return {
    id: c.id,
    code: c.code,
    usedById: c.usedById,
    usedAt: c.usedAt,
    expiresAt: c.expiresAt,
    revokedAt: c.revokedAt,
    createdAt: c.createdAt,
    fromAllowance: c.fromAllowance,
    note: c.note,
  };
}

async function buildInviteMeta(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { role: true },
  });
  if (!user) return null;

  const cfg = roleInviteConfig(user.role);
  const allowanceInfo = computeInviteAllowance(user);
  const roleGen =
    hasPermission(user.role, PERMISSIONS.INVITES_GENERATE) && cfg.batchLimit > 0;
  const totalOutstanding = await countOutstandingInvites(user.id);
  const roleOutstanding = roleGen ? await countOutstandingInvites(user.id, false) : 0;
  const roleHeadroom = roleGen
    ? cfg.outstandingLimit > 0
      ? Math.max(0, cfg.outstandingLimit - roleOutstanding)
      : Number.MAX_SAFE_INTEGER
    : 0;

  let cooldownRemainingSeconds = 0;
  if (cfg.cooldownMinutes > 0 && user.inviteLastGeneratedAt) {
    const elapsed = Date.now() - user.inviteLastGeneratedAt.getTime();
    const cooldownMs = cfg.cooldownMinutes * 60000;
    if (elapsed < cooldownMs) cooldownRemainingSeconds = Math.ceil((cooldownMs - elapsed) / 1000);
  }

  const enabled = await getInviteGenerationEnabled();
  const seat = await computeSeatInfo(user.id, user);

  return {
    banned: user.inviteBanned,
    generationEnabled: enabled,
    canGenerate:
      !user.inviteBanned &&
      enabled &&
      (allowanceInfo.allowance > 0 || roleHeadroom > 0) &&
      cooldownRemainingSeconds === 0,
    allowance: allowanceInfo.allowance,
    allowanceExpiresAt: allowanceInfo.allowanceExpiresAt,
    allowanceActive: allowanceInfo.active,
    outstanding: totalOutstanding,
    cooldownRemainingSeconds,
    seat: seat.limited
      ? { limited: true, limit: seat.limit, used: seat.used, remaining: seat.remaining }
      : null,
    role: {
      slug: user.role.slug,
      canGenerate: roleGen,
      batchLimit: cfg.batchLimit,
      outstandingLimit: cfg.outstandingLimit,
      cooldownMinutes: cfg.cooldownMinutes,
      defaultExpiryDays: cfg.defaultExpiryDays,
      minExpiryDays: cfg.minExpiryDays,
      maxExpiryDays: cfg.maxExpiryDays,
    },
  };
}

router.post("/", requireAuth, async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: parsed.error.issues[0].message,
    });
  }

  const { count, expiresInDays } = parsed.data;

  const me = await prisma.user.findUnique({
    where: { id: req.userId! },
    include: { role: true },
  });
  if (!me) {
    return res.status(401).json({ success: false, error: "Unauthorized" });
  }

  // ------------------------------------------------------------------
  // Self-service generation (role quota + event allowance).
  // Admins are held to the same allowance/quota here; the unconstrained
  // operator generator lives at POST /api/admin/invites.
  // ------------------------------------------------------------------

  // A ban removes the *ability to earn* invites — event credits, role quota and new
  // purchases. It does not remove access to what was already paid for: a banned
  // customer must still be able to turn a purchased credit into a code and hand it
  // to someone. So the ban is not a flat 403 here; it restricts *which* credits may
  // be spent (purchased only) and, via the 14-day purchased window, for how long.
  const bannedPurchasedOnly = me.inviteBanned;
  if (bannedPurchasedOnly) {
    const purchased = await remainingCreditsForSource(me.id, "PURCHASED");
    if (purchased <= 0) {
      return res.status(403).json({
        success: false,
        error: "You are banned from generating invite codes.",
      });
    }
  }

  if (!(await getInviteGenerationEnabled())) {
    return res.status(403).json({
      success: false,
      error: "Invite generation is currently disabled.",
    });
  }

  const outcome = await prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "users" WHERE "id" = ${me.id}::uuid FOR UPDATE
    `;
    if (locked.length === 0) {
      throw new InviteHttpError(401, "Unauthorized");
    }

    await runInviteRefundSweep(me.id, tx);

    const fresh = await tx.user.findUnique({
      where: { id: me.id },
      include: { role: true },
    });
    if (!fresh) {
      throw new InviteHttpError(401, "Unauthorized");
    }

    const cfg = roleInviteConfig(fresh.role);
    const allowanceInfo = computeInviteAllowance(fresh);
    // Role quota is an earned privilege, so a banned account never draws on it.
    const roleGen =
      !bannedPurchasedOnly &&
      hasPermission(fresh.role, PERMISSIONS.INVITES_GENERATE) &&
      cfg.batchLimit > 0;

    const roleOutstanding = roleGen ? await countOutstandingInvites(fresh.id, false, tx) : 0;
    const roleHeadroom = roleGen
      ? cfg.outstandingLimit > 0
        ? Math.max(0, cfg.outstandingLimit - roleOutstanding)
        : Number.MAX_SAFE_INTEGER
      : 0;

    const seat = await computeSeatInfo(fresh.id, fresh, tx);
    if (seat.limited && seat.remaining <= 0) {
      throw new InviteHttpError(
        403,
        `You've reached your team seat limit of ${seat.limit} member(s). Please contact an administrator to raise it.`
      );
    }

    // Ledger truth for the draw, so codes can be attributed to the grant that paid for
    // them. Without this the balance is just a number and a refund or a lapsed ban
    // window cannot tell which codes were paid for and which were earned.
    const purchasedRemaining = await remainingCreditsForSource(fresh.id, "PURCHASED", tx);

    // For a banned account the ledger is the ceiling on what may be spent, not the
    // counter: the ban already zeroed the earned credits, and the purchased window
    // can close independently of the counter.
    const allowanceCeiling = bannedPurchasedOnly
      ? Math.min(allowanceInfo.allowance, purchasedRemaining)
      : allowanceInfo.allowance;

    let available = allowanceCeiling + roleHeadroom;
    if (seat.limited) {
      available = Math.min(available, seat.remaining);
    }
    if (available <= 0) {
      throw new InviteHttpError(403, "You have no invite credits available.");
    }

    if (cfg.cooldownMinutes > 0 && fresh.inviteLastGeneratedAt) {
      const elapsed = Date.now() - fresh.inviteLastGeneratedAt.getTime();
      const cooldownMs = cfg.cooldownMinutes * 60000;
      if (elapsed < cooldownMs) {
        const remaining = Math.ceil((cooldownMs - elapsed) / 1000);
        throw new InviteHttpError(429, `Please wait ${remaining}s before generating more invites.`, remaining);
      }
    }

    let batch = Math.min(count, available);
    if (batch < 1) {
      throw new InviteHttpError(400, "That many invites exceeds your available credits.");
    }
    if (roleGen) {
      batch = Math.min(batch, cfg.batchLimit);
    }

    const now = Date.now();
    let maxDays = cfg.maxExpiryDays;
    if (allowanceInfo.active && allowanceInfo.allowanceExpiresAt) {
      const remainingDays = Math.max(1, Math.floor((allowanceInfo.allowanceExpiresAt.getTime() - now) / DAY_MS));
      maxDays = Math.min(maxDays, remainingDays);
    }

    if (maxDays < cfg.minExpiryDays) {
      throw new InviteHttpError(400, "Not enough time left on your invite allowance to generate invites.");
    }

    let defaultDays = Math.min(cfg.defaultExpiryDays, maxDays);
    if (defaultDays < cfg.minExpiryDays) defaultDays = Math.min(cfg.minExpiryDays, maxDays);

    const days = expiresInDays ?? defaultDays;
    if (days < cfg.minExpiryDays) {
      throw new InviteHttpError(400, `Invites must expire at least ${cfg.minExpiryDays} day(s) from now.`);
    }
    if (days > maxDays) {
      throw new InviteHttpError(400, `Invites can expire at most ${maxDays} day(s) from now.`);
    }
    const expiresAt = new Date(now + days * DAY_MS);

    const allowanceSourced = Math.min(batch, allowanceCeiling);
    const roleSourced = batch - allowanceSourced;

    // Oldest-expiring grant first, so a short-lived grant is spent before a
    // perpetual one instead of being stranded behind it.
    const allocations =
      allowanceSourced > 0
        ? await allocateInviteCredits(
            fresh.id,
            allowanceSourced,
            tx,
            bannedPurchasedOnly ? ["PURCHASED"] : undefined
          )
        : [];

    // One code per allocated credit, tagged with the grant it came from. `purchased`
    // is what the ban keeps alive, so it has to be set per grant, not per batch.
    const attributedCodes = allocations.flatMap((a) =>
      Array.from({ length: a.quantity }, () => ({
        code: crypto.randomBytes(8).toString("hex"),
        createdById: fresh.id,
        expiresAt,
        fromAllowance: true,
        purchased: a.source === "PURCHASED",
        ...(a.source === "PURCHASED" ? { purchasedAt: new Date() } : {}),
        sourceGrantId: a.grantId,
      })),
    );

    // Credits the ledger does not know about still have to work. The ledger was
    // introduced without backfilling grants, so every pre-existing balance — and any
    // credit granted outside it — sits on the counter alone. Those are emitted
    // unattributed, exactly as they were before provenance existed.
    //
    // A banned account gets no such fallback: it draws on paid credits exclusively,
    // and an unattributed code would be an earned credit slipping past the
    // restriction. If the ledger cannot cover the whole request, the request fails
    // rather than being partly filled from credits the ban removed.
    const unledgered = bannedPurchasedOnly
      ? 0
      : Math.max(0, allowanceSourced - attributedCodes.length);
    if (attributedCodes.length + unledgered < allowanceSourced) {
      throw new InviteHttpError(403, "You have no invite credits available.");
    }

    const allowanceCodes = [
      ...attributedCodes,
      ...Array.from({ length: unledgered }, () => ({
        code: crypto.randomBytes(8).toString("hex"),
        createdById: fresh.id,
        expiresAt,
        fromAllowance: true,
        // Nothing in the ledger paid for this one, so it is not marked purchased.
        purchased: false,
      })),
    ];

    // The counter is what the rest of the app reads, and what a ban/unban
    // round-trip preserves. For a banned account it is reconciled to the ledger
    // rather than merely decremented, so it cannot drift from the grants behind it.
    const purchasedAfterDraw = await remainingCreditsForSource(fresh.id, "PURCHASED", tx);

    await tx.user.update({
      where: { id: fresh.id },
      data: {
        ...(bannedPurchasedOnly
          ? { inviteAllowance: purchasedAfterDraw }
          : allowanceSourced > 0
            ? { inviteAllowance: { decrement: allowanceSourced } }
            : {}),
        inviteLastGeneratedAt: new Date(),
      },
    });

    await tx.inviteCode.createMany({
      data: [
        ...allowanceCodes,
        ...Array.from({ length: roleSourced }, () => ({
          code: crypto.randomBytes(8).toString("hex"),
          createdById: fresh.id,
          expiresAt,
          fromAllowance: false,
        })),
      ],
    });

    return { userId: fresh.id, batch, purchasedCoded: attributedCodes.filter((c) => c.purchased).length };
  }).catch((err: unknown) => {
    if (err instanceof InviteHttpError) return err;
    throw err;
  });

  if (outcome instanceof InviteHttpError) {
    return res.status(outcome.status).json({
      success: false,
      error: outcome.message,
      ...(outcome.data ?? {}),
    });
  }

  const created = await prisma.inviteCode.findMany({
    where: { createdById: outcome.userId },
    orderBy: { createdAt: "desc" },
    take: outcome.batch,
  });

  res.status(201).json({
    success: true,
    data: created.map(serializeCode),
    meta: await buildInviteMeta(outcome.userId),
  });
});

router.get("/", requireAuth, async (req, res) => {
  await runInviteRefundSweep(req.userId!);

  const codes = await prisma.inviteCode.findMany({
    where: { createdById: req.userId! },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true,
      code: true,
      usedById: true,
      usedAt: true,
      expiresAt: true,
      revokedAt: true,
      createdAt: true,
      fromAllowance: true,
      note: true,
    },
  });

  res.json({
    success: true,
    data: codes,
    meta: await buildInviteMeta(req.userId!),
  });
});

router.get("/:code", publicRateLimit, async (req: Request<{ code: string }>, res) => {
  const invite = await prisma.inviteCode.findUnique({
    where: { code: req.params.code },
    include: { createdBy: { select: { id: true, username: true } } },
  });

  const notFound = () => res.status(404).json({ success: false, error: "Invite code not found" });

  if (!invite || invite.revokedAt) {
    return notFound();
  }
  if (invite.expiresAt && invite.expiresAt < new Date()) {
    return notFound();
  }
  if (invite.usedById) {
    return notFound();
  }

  const env = getEnv();
  const inviteeDiscountPercent = env.AFFILIATE_INVITEE_DISCOUNT_PERCENT;

  let referrer: {
    username: string;
    slug: string;
    avatar: string | null;
    displayName: string | null;
  } | null = null;
  // A guest invite purchase has no owner, so there is no referrer to attribute the
  // signup to. The code still works and no referral reward is paid out, which is
  // why the null check is on the creator rather than on the profile.
  const creator = invite.createdById ? invite.createdBy : null;
  if (creator) {
    const profile = await prisma.profile.findFirst({
      where: { userId: creator.id, isPrimary: true, isPublic: true },
      select: { slug: true, avatar: true, displayName: true },
    });
    referrer = {
      username: creator.username,
      slug: profile?.slug ?? creator.username,
      avatar: profile?.avatar ?? null,
      displayName: profile?.displayName ?? null,
    };
  }

  res.json({
    success: true,
    data: {
      code: invite.code,
      status: "valid",
      inviteeDiscountPercent,
      discountDurationDays: env.AFFILIATE_DISCOUNT_DURATION_DAYS,
      referrer,
    },
  });
});

router.delete("/:id", requireAuth, async (req: Request<{ id: string }>, res) => {
  const code = await prisma.inviteCode.findUnique({
    where: { id: req.params.id },
  });

  if (!code) {
    return res.status(404).json({ success: false, error: "Invite code not found" });
  }

  if (code.usedById) {
    return res.status(400).json({ success: false, error: "Cannot revoke a used invite code" });
  }

  if (code.revokedAt) {
    return res.status(400).json({ success: false, error: "Invite code already revoked" });
  }

  const requester = await prisma.user.findUnique({
    where: { id: req.userId! },
    include: { role: true },
  });
  const canManageInvites = requester ? hasPermission(requester.role, PERMISSIONS.INVITES_MANAGE) : false;
  if (code.createdById !== req.userId! && !canManageInvites) {
    return res.status(403).json({ success: false, error: "Not your invite code" });
  }

  await prisma.inviteCode.update({
    where: { id: req.params.id },
    data: { revokedAt: new Date() },
  });

  res.json({ success: true, message: "Invite code revoked" });
});

router.patch("/:id/note", requireAuth, async (req: Request<{ id: string }>, res) => {
  const parsed = z
    .object({
      note: z.string().max(500).nullable(),
    })
    .safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: parsed.error.issues[0].message,
    });
  }

  const code = await prisma.inviteCode.findUnique({
    where: { id: req.params.id },
  });
  if (!code) {
    return res.status(404).json({ success: false, error: "Invite code not found" });
  }

  const requester = await prisma.user.findUnique({
    where: { id: req.userId! },
    include: { role: true },
  });
  if (!requester) {
    return res.status(401).json({ success: false, error: "Unauthorized" });
  }
  const canManageInvites = hasPermission(requester.role, PERMISSIONS.INVITES_MANAGE);
  if (code.createdById !== req.userId! && !canManageInvites) {
    return res.status(403).json({ success: false, error: "Not your invite code" });
  }

  const raw = parsed.data.note;
  const note = raw === null ? null : stripHtml(raw).trim() || null;

  const updated = await prisma.inviteCode.update({
    where: { id: req.params.id },
    data: { note },
  });

  res.json({ success: true, data: serializeCode(updated) });
});

export default router;
