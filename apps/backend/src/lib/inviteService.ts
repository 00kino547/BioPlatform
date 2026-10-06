import { type InviteCreditGrant, type InviteCreditSource, type Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "./prisma.js";

export const DAY_MS = 86400000;

type Db = Prisma.TransactionClient | PrismaClient;

/**
 * Either a transaction client or the root client.
 *
 * Exported so callers that already hold a transaction (the ban paths in
 * `routes/admin.ts` and `cli/users.ts`) can pass it straight through instead of
 * opening a nested transaction that would deadlock against their own row lock.
 */
export type InviteDb = Db;

export const INVITE_GENERATION_SETTING_KEY = "invites.userGenerationEnabled";

/** Admin switch gating the paid-invite store. Mirrors the generation switch. */
export const INVITE_PURCHASE_SETTING_KEY = "invites.purchaseEnabled";

/** Admin switch choosing how far the instance goes on reselling paid invites. */
export const INVITE_RESALE_SETTING_KEY = "invites.resaleMode";

/**
 * How an instance governs reselling of invite codes the owner paid for.
 *
 * - `off`        resale is not addressed; no clause, no tracking.
 * - `permitted`  the Terms state positively that resale IS allowed, and under
 *                what conditions. Nothing is blocked or tracked.
 * - `legal`      the Terms state that resale is not permitted. Text only, nothing
 *                is tracked or blocked (invite codes are plain bearer secrets, so
 *                transfer cannot be prevented technically anyway).
 * - `enforced`   as `legal`, plus paid codes are tagged so onward sharing can be
 *                surfaced to the owner in admin.
 *
 * `off` and `permitted` are deliberately different: an operator who permits
 * resale wants the permission written down (a buyer can then act on it), while
 * `off` means the instance declines to state a position at all.
 */
export const INVITE_RESALE_MODES = ["off", "permitted", "legal", "enforced"] as const;
export type InviteResaleMode = (typeof INVITE_RESALE_MODES)[number];

/** The resale clause the legal pages publish, independent of enforcement. */
export type InviteResaleClause = "none" | "permitted" | "prohibited";

function isResaleMode(value: string): value is InviteResaleMode {
  return (INVITE_RESALE_MODES as readonly string[]).includes(value);
}

/**
 * Window a banned account keeps its paid invite credits for.
 *
 * Banning revokes event and role-quota codes but leaves purchased codes usable,
 * so a paid customer can still hand a code to someone. That access is not open
 * ended: the balance runs out on this window, and a later sweep returns whatever
 * is left (see `sweepLapsedPurchasedAllowance`).
 */
export const PURCHASED_ALLOWANCE_WINDOW_DAYS = 14;

export async function getInviteGenerationEnabled(): Promise<boolean> {
  const setting = await prisma.systemSetting.findUnique({
    where: { key: INVITE_GENERATION_SETTING_KEY },
  });
  return setting?.value === "true";
}

export async function setInviteGenerationEnabled(enabled: boolean): Promise<void> {
  await prisma.systemSetting.upsert({
    where: { key: INVITE_GENERATION_SETTING_KEY },
    update: { value: String(enabled) },
    create: { key: INVITE_GENERATION_SETTING_KEY, value: String(enabled) },
  });
}

export async function getInvitePurchaseEnabled(): Promise<boolean> {
  const setting = await prisma.systemSetting.findUnique({
    where: { key: INVITE_PURCHASE_SETTING_KEY },
  });
  return setting?.value === "true";
}

export async function setInvitePurchaseEnabled(enabled: boolean): Promise<void> {
  await prisma.systemSetting.upsert({
    where: { key: INVITE_PURCHASE_SETTING_KEY },
    update: { value: String(enabled) },
    create: { key: INVITE_PURCHASE_SETTING_KEY, value: String(enabled) },
  });
}

/** Defaults to `off`, so an instance never inherits a resale clause it did not ask for. */
export async function getInviteResaleMode(): Promise<InviteResaleMode> {
  const setting = await prisma.systemSetting.findUnique({
    where: { key: INVITE_RESALE_SETTING_KEY },
  });
  const raw = setting?.value;
  return raw !== undefined && isResaleMode(raw) ? raw : "off";
}

export async function setInviteResaleMode(mode: InviteResaleMode): Promise<void> {
  await prisma.systemSetting.upsert({
    where: { key: INVITE_RESALE_SETTING_KEY },
    update: { value: mode },
    create: { key: INVITE_RESALE_SETTING_KEY, value: mode },
  });
}

/**
 * The resale policy as the legal pages and the storefront need it.
 *
 * `sellingAllowed` is what drives the Terms clause, so the two never disagree:
 * the document only ever shows a prohibition when the instance has actually set
 * one, and shows nothing at all in `off` mode.
 */
export interface InviteResalePolicy {
  mode: InviteResaleMode;
  sellingAllowed: boolean;
  enforcementActive: boolean;
  /**
   * What the legal pages should say about resale.
   *
   * Derived from the mode through a single lookup so the document and the
   * behaviour can never drift apart: the Terms publish a prohibition only when
   * `clause` is `prohibited`, and a permission only when it is `permitted`.
   */
  clause: InviteResaleClause;
}

/** Which resale clause, if any, the legal pages publish for a given mode. */
const RESALE_CLAUSE_BY_MODE: Record<InviteResaleMode, InviteResaleClause> = {
  off: "none",
  permitted: "permitted",
  legal: "prohibited",
  enforced: "prohibited",
};

export async function getInviteResalePolicy(): Promise<InviteResalePolicy> {
  const mode = await getInviteResaleMode();
  return {
    mode,
    // `off` and `permitted` both let a member sell their codes; they differ only
    // in whether the instance writes that down.
    sellingAllowed: mode === "off" || mode === "permitted",
    enforcementActive: mode === "enforced",
    clause: RESALE_CLAUSE_BY_MODE[mode],
  };
}

export interface InviteAllowanceInfo {
  allowance: number;
  allowanceExpiresAt: Date | null;
  active: boolean;
}

export function computeInviteAllowance(user: {
  inviteAllowance: number;
  inviteAllowanceExpiresAt: Date | null;
}): InviteAllowanceInfo {
  const active =
    user.inviteAllowance > 0 &&
    (user.inviteAllowanceExpiresAt === null || user.inviteAllowanceExpiresAt > new Date());
  return {
    allowance: active ? user.inviteAllowance : 0,
    allowanceExpiresAt: user.inviteAllowanceExpiresAt,
    active,
  };
}

/**
 * Refunds one allowance credit for every invite the user generated from an
 * event allowance that expired unused *before* the allowance itself expires.
 * Credits that die exactly at the allowance expiry are not refunded.
 */
export async function runInviteRefundSweep(userId: string, db: Db = prisma): Promise<number> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { inviteAllowance: true, inviteAllowanceExpiresAt: true },
  });
  if (!user) return 0;

  const allowanceExpiresAt = user.inviteAllowanceExpiresAt;
  const allowanceActive =
    allowanceExpiresAt === null || allowanceExpiresAt > new Date();
  if (!allowanceActive) return 0;

  const now = new Date();
  const expiredCodes = await db.inviteCode.findMany({
    where: {
      createdById: userId,
      fromAllowance: true,
      // Purchased codes are excluded on purpose. They are funded by a ledger
      // grant with its own 14-day window, so refunding one here would credit the
      // balance a second time when `sweepLapsedPurchasedAllowance` runs.
      purchased: false,
      usedAt: null,
      revokedAt: null,
      refundedAt: null,
      expiresAt: { not: null, lte: now },
    },
    select: { id: true, expiresAt: true },
  });

  const refundable =
    allowanceExpiresAt === null
      ? expiredCodes
      : expiredCodes.filter((c) => (c.expiresAt as Date) < allowanceExpiresAt);

  if (refundable.length === 0) return 0;

  const sweep = async (tx: Db): Promise<void> => {
    // Conditionally mark refunded with the same eligibility predicates re-checked
    // inside the UPDATE itself, and credit the allowance only for rows actually
    // transitioned. This closes the TOCTOU where two concurrent sweeps both read
    // the same expired codes and both increment the allowance: only one sweep
    // wins the `refundedAt: null` guard, so the grant is sized by the
    // affected-row count instead of a stale pre-read.
    const marked = await tx.inviteCode.updateMany({
      where: {
        id: { in: refundable.map((c) => c.id) },
        purchased: false,
        usedAt: null,
        revokedAt: null,
        refundedAt: null,
        expiresAt: { not: null, lte: now },
      },
      data: { refundedAt: now },
    });
    if (marked.count <= 0) return;
    await tx.user.update({
      where: { id: userId },
      data: { inviteAllowance: { increment: marked.count } },
    });
  };

  if ("$transaction" in db) {
    await (db as PrismaClient).$transaction(async (tx) => sweep(tx as unknown as Db));
  } else {
    await sweep(db);
  }

  return refundable.length;
}

export async function countOutstandingInvites(
  userId: string,
  fromAllowance?: boolean,
  db: Db = prisma
): Promise<number> {
  const now = new Date();
  return db.inviteCode.count({
    where: {
      createdById: userId,
      usedAt: null,
      revokedAt: null,
      ...(fromAllowance === undefined ? {} : { fromAllowance }),
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
  });
}

export async function countConsumedInvites(userId: string, db: Db = prisma): Promise<number> {
  return db.inviteCode.count({
    where: { createdById: userId, usedById: { not: null } },
  });
}

export async function hasPaidOrder(userId: string, db: Db = prisma): Promise<boolean> {
  const order = await db.order.findFirst({
    where: { userId, plan: "ENTERPRISE", status: "PAID" },
    select: { id: true },
  });
  return order !== null;
}

export interface SeatInfo {
  limited: boolean;
  limit: number;
  used: number;
  remaining: number;
}

/**
 * Enterprise seat limit for gifted ENTERPRISE accounts.
 * A limit is enforced only when the user is ENTERPRISE, the admin has set a
 * positive seatLimit, and the account has never paid for ENTERPRISE (a paid
 * order means the tier was earned through billing, not gifted).
 */
export async function computeSeatInfo(
  userId: string,
  user: { tier: string; seatLimit: number | null },
  db: Db = prisma
): Promise<SeatInfo> {
  const limited =
    user.tier === "ENTERPRISE" && user.seatLimit !== null && user.seatLimit > 0
      ? !(await hasPaidOrder(userId, db))
      : false;
  if (!limited) {
    return { limited: false, limit: 0, used: 0, remaining: Number.MAX_SAFE_INTEGER };
  }
  const used = await countConsumedInvites(userId, db);
  const limit = user.seatLimit as number;
  return { limited: true, limit, used, remaining: Math.max(0, limit - used) };
}

export interface RoleInviteConfig {
  batchLimit: number;
  outstandingLimit: number;
  cooldownMinutes: number;
  defaultExpiryDays: number;
  minExpiryDays: number;
  maxExpiryDays: number;
}

export function roleInviteConfig(role: {
  inviteBatchLimit: number;
  inviteOutstandingLimit: number;
  inviteCooldownMinutes: number;
  inviteDefaultExpiryDays: number;
  inviteMinExpiryDays: number;
  inviteMaxExpiryDays: number;
}): RoleInviteConfig {
  return {
    batchLimit: role.inviteBatchLimit,
    outstandingLimit: role.inviteOutstandingLimit,
    cooldownMinutes: role.inviteCooldownMinutes,
    defaultExpiryDays: role.inviteDefaultExpiryDays,
    minExpiryDays: role.inviteMinExpiryDays,
    maxExpiryDays: role.inviteMaxExpiryDays,
  };
}

// ---------------------------------------------------------------------------
// Credit ledger
//
// `User.inviteAllowance` is a bare counter: it cannot say which source a credit
// came from, how many of a grant were already spent, or whether the grant it
// belonged to has since lapsed. Everything below exists to make those questions
// answerable, because paid credits have to survive a ban, a refund and an
// expiry window without the counter drifting.
// ---------------------------------------------------------------------------

/**
 * Widens an allowance window instead of replacing it.
 *
 * `null` means "never expires", which absorbs anything else — a perpetual grant
 * must not be narrowed by a 14-day ban window. This mirrors the `GREATEST`
 * coalesce the bulk admin event grant already uses in SQL.
 */
function mergeAllowanceExpiry(existing: Date | null, incoming: Date | null): Date | null {
  if (existing === null || incoming === null) return null;
  return existing.getTime() > incoming.getTime() ? existing : incoming;
}

export interface GrantInviteCreditsInput {
  source: InviteCreditSource;
  quantity: number;
  /** `null` for credits that never expire (purchased). */
  expiresAt?: Date | null;
  /** Paid order that funded the grant; also its idempotency key. */
  orderId?: string | null;
}

/**
 * Adds credits to an account and records the grant in the same transaction.
 *
 * The ledger row and the counter increment are inseparable: a crash between them
 * would leave a balance nobody can explain, and an owner refunding an order
 * would be unable to tell which credits to claw back.
 */
export async function grantInviteCredits(
  userId: string,
  input: GrantInviteCreditsInput,
  db: Db = prisma
): Promise<InviteCreditGrant> {
  const quantity = Math.max(0, Math.trunc(input.quantity));
  if (quantity === 0) {
    throw new Error("grantInviteCredits requires a positive quantity");
  }
  const expiresAt = input.expiresAt ?? null;

  const run = async (tx: Db): Promise<InviteCreditGrant> => {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { inviteAllowanceExpiresAt: true },
    });
    if (!user) throw new Error("grantInviteCredits: user not found");

    const grant = await tx.inviteCreditGrant.create({
      data: { userId, source: input.source, quantity, expiresAt, orderId: input.orderId ?? null },
    });

    await tx.user.update({
      where: { id: userId },
      data: {
        inviteAllowance: { increment: quantity },
        // Only widen. A grant that is perpetual clears the window entirely; a
        // dated grant extends an existing window but never shortens it.
        inviteAllowanceExpiresAt: mergeAllowanceExpiry(user.inviteAllowanceExpiresAt, expiresAt),
      },
    });

    return grant;
  };

  return "$transaction" in db
    ? (db as PrismaClient).$transaction(async (tx) => run(tx as unknown as Db))
    : run(db);
}

/**
 * Credits granted by `source` that have not been turned into codes yet.
 *
 * A grant is live while it is unrevoked and unrecovered. Consumption is measured
 * from the codes that point back at the grant, so a credit counts as spent the
 * moment its code is generated — matching how the counter is actually drained.
 */
export async function remainingCreditsForSource(
  userId: string,
  source: InviteCreditSource,
  db: Db = prisma
): Promise<number> {
  const grants = await db.inviteCreditGrant.findMany({
    where: {
      userId,
      source,
      revokedAt: null,
      recoveredAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    select: {
      quantity: true,
      _count: { select: { codes: { where: { refundedAt: null } } } },
    },
  });

  return grants.reduce((sum, g) => sum + Math.max(0, g.quantity - g._count.codes), 0);
}

export interface CreditAllocation {
  grantId: string;
  source: InviteCreditSource;
  quantity: number;
}

/**
 * Attributes `quantity` credits to live grants, oldest first.
 *
 * The counter is fungible across sources, so generation draws from it blindly;
 * this is what makes the draw auditable afterwards. Greedy oldest-first means an
 * expiring grant is spent before a perpetual one, which keeps short-window event
 * credits from being stranded behind purchased ones.
 *
 * `sources` restricts the draw to particular origins. That is how a banned account
 * is held to purchased credits only: the restriction lives with the allocator
 * instead of depending on the caller having capped the quantity correctly.
 */
export async function allocateInviteCredits(
  userId: string,
  quantity: number,
  db: Db = prisma,
  sources?: InviteCreditSource[]
): Promise<CreditAllocation[]> {
  let remaining = Math.max(0, Math.trunc(quantity));
  if (remaining === 0) return [];

  const grants = await db.inviteCreditGrant.findMany({
    where: {
      userId,
      revokedAt: null,
      recoveredAt: null,
      // Lets a restricted draw (a banned account spending purchased credits only)
      // refuse the earned grants outright rather than relying on the caller having
      // already capped the quantity correctly.
      ...(sources && sources.length > 0 ? { source: { in: sources } } : {}),
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    orderBy: [{ expiresAt: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
    select: {
      id: true,
      source: true,
      quantity: true,
      _count: { select: { codes: { where: { refundedAt: null } } } },
    },
  });

  const allocations: CreditAllocation[] = [];
  for (const grant of grants) {
    if (remaining <= 0) break;
    const free = Math.max(0, grant.quantity - grant._count.codes);
    if (free === 0) continue;
    const take = Math.min(free, remaining);
    allocations.push({ grantId: grant.id, source: grant.source, quantity: take });
    remaining -= take;
  }
  return allocations;
}

/**
 * Expires paid credits that outlived a ban window.
 *
 * Runs lazily on reads that already touch invite state, and can also be called
 * from a scheduler. Two outcomes per user, decided by ban status:
 *
 * - banned      the credits are *restored* to the balance and the window is
 *               cleared to perpetual. A banned account cannot generate, so the
 *               credits cannot be spent; they are held, not destroyed.
 * - not banned  the credits are revoked, and any live purchased codes they
 *               funded are revoked with them, so a lapsed purchase cannot keep
 *               handing out access.
 *
 * `recoveredAt` is the idempotency guard: a grant is restored or revoked once,
 * no matter how often this runs.
 */
export async function sweepLapsedPurchasedAllowance(db: Db = prisma, now = new Date()): Promise<number> {
  const lapsed = await db.inviteCreditGrant.findMany({
    where: { source: "PURCHASED", revokedAt: null, recoveredAt: null, expiresAt: { lt: now } },
    select: { id: true, userId: true, quantity: true },
    orderBy: { expiresAt: "asc" },
    take: 500,
  });
  if (lapsed.length === 0) return 0;

  let processed = 0;
  for (const userId of new Set(lapsed.map((g) => g.userId))) {
    const candidateIds = lapsed.filter((g) => g.userId === userId).map((g) => g.id);
    const quantityById = new Map(lapsed.map((g) => [g.id, g.quantity] as const));

    const handle = async (tx: Db): Promise<void> => {
      // Lock the user row so a concurrent generation cannot draw credits that are
      // being revoked underneath it.
      const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM "users" WHERE "id" = ${userId}::uuid FOR UPDATE
      `;
      if (locked.length === 0) return;

      // Re-read under the lock rather than trusting the outer read: an overlapping
      // sweep, or this function on its previous run, may already have recovered some
      // of these. Only rows this run actually claims may be restored or revoked.
      const eligible = await tx.inviteCreditGrant.findMany({
        where: { id: { in: candidateIds }, recoveredAt: null, revokedAt: null, expiresAt: { lt: now } },
        select: { id: true },
      });
      if (eligible.length === 0) return;

      const claimed = await tx.inviteCreditGrant.updateMany({
        where: { id: { in: eligible.map((g) => g.id) }, recoveredAt: null, revokedAt: null },
        data: { recoveredAt: now },
      });
      if (claimed.count === 0) return;
      const claimedIds = eligible.map((g) => g.id);

      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { inviteBanned: true },
      });
      if (!user) return;

      // Revoke the codes these grants funded in *both* branches. Restoring the
      // balance while leaving the codes live would let a buyer spend the same
      // credit twice — once through the restored balance and once by handing out a
      // code. Already-redeemed codes stay valid: that person has joined.
      await tx.inviteCode.updateMany({
        where: { sourceGrantId: { in: claimedIds }, usedAt: null, revokedAt: null },
        data: { revokedAt: now },
      });

      if (user.inviteBanned) {
        // Held, not destroyed: the window is cleared so the restored balance is
        // actually reachable again once the ban lifts. A banned account cannot
        // generate, so these sit idle rather than leaking access.
        const restored = claimedIds.reduce((sum, id) => sum + (quantityById.get(id) ?? 0), 0);
        if (restored > 0) {
          await tx.user.update({
            where: { id: userId },
            data: {
              inviteAllowance: { increment: restored },
              inviteAllowanceExpiresAt: null,
            },
          });
        }
      }
    };

    if ("$transaction" in db) {
      await (db as PrismaClient).$transaction(async (tx) => handle(tx as unknown as Db));
    } else {
      await handle(db);
    }
    processed += 1;
  }
  return processed;
}

/**
 * Re-prices a paid grant's effect on an account after its window closed.
 *
 * On refund the credits are *revoked* rather than returned: the buyer gets the
 * money back and loses the codes, which is the only outcome that cannot be
 * double-spent. Already-redeemed codes stay valid, because the person who used
 * them has already joined.
 */
export async function revokePurchasedGrantForOrder(orderId: string, db: Db = prisma): Promise<number> {
  const now = new Date();

  const run = async (tx: Db): Promise<number> => {
    const grants = await tx.inviteCreditGrant.findMany({
      where: { orderId, source: "PURCHASED", revokedAt: null },
      select: { id: true, userId: true },
    });
    if (grants.length === 0) return 0;

    const revoked = await tx.inviteCreditGrant.updateMany({
      where: { id: { in: grants.map((g) => g.id) }, revokedAt: null },
      data: { revokedAt: now },
    });
    if (revoked.count === 0) return 0;

    for (const grant of grants) {
      await tx.inviteCode.updateMany({
        where: {
          sourceGrantId: grant.id,
          usedAt: null,
          revokedAt: null,
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
        data: { revokedAt: now },
      });
    }
    return revoked.count;
  };

  return "$transaction" in db
    ? (db as PrismaClient).$transaction(async (tx) => run(tx as unknown as Db))
    : run(db);
}

/**
 * Ban policy for the invite balance.
 *
 * Banning revokes event and role-quota codes, but a paid customer keeps what they
 * bought: their codes stay live and their balance starts a bounded window rather
 * than being wiped, so a ban cannot silently destroy a purchase. Accounts with no
 * paid credits keep the previous behaviour exactly (balance zeroed).
 *
 * Returns the data patch for the `user.update` the caller already performs.
 */
export async function applyInviteBanPolicy(
  userId: string,
  db: Db = prisma,
  now = new Date()
): Promise<{ inviteAllowance?: number; inviteAllowanceExpiresAt?: Date | null }> {
  const purchased = await remainingCreditsForSource(userId, "PURCHASED", db);
  if (purchased <= 0) {
    return { inviteAllowance: 0 };
  }
  // Set the balance explicitly rather than leaving it alone. Event and role-quota
  // credits are dropped by the ban, so the only thing that may survive it is what
  // was paid for — an untouched counter would leave those credits spendable.
  return {
    inviteAllowance: purchased,
    inviteAllowanceExpiresAt: new Date(now.getTime() + PURCHASED_ALLOWANCE_WINDOW_DAYS * DAY_MS),
  };
}
