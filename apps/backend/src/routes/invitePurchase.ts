import { randomBytes } from "node:crypto";
import jwt from "jsonwebtoken";
import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { stripHtml } from "../lib/validation.js";
import {
  MAX_PACK_QUANTITY,
  invitePackConfig,
  priceForPackQuantity,
  type InvitePack,
} from "../lib/invitePricing.js";
import {
  getInvitePurchaseEnabled,
  getInviteResalePolicy,
  sweepLapsedPurchasedAllowance,
} from "../lib/inviteService.js";
import {
  INVITE_PURCHASE_PREFIX,
  signInviteClaimToken,
  toPurchaseSummary,
  verifyInviteClaimToken,
} from "../lib/inviteOrders.js";
import { getEnv } from "../config/env.js";
import { getManualPaymentInstructions } from "../lib/contactConfig.js";
import { sendNewsletterEmail } from "../lib/newsletter.js";
import { createStripeCheckout, stripeEnabled } from "../lib/payments/stripe.js";
import { createPayPalOrder, paypalEnabled } from "../lib/payments/paypal.js";
import { createCryptoInvoice, cryptoEnabled, getCryptoProvider } from "../lib/payments/crypto.js";
import { supportedCoins } from "../lib/payments/rates.js";

const router = Router();

/**
 * Per-IP limiter for the unauthenticated storefront.
 *
 * Local (in-process) map, matching the limiter `routes/invite.ts` already uses
 * for its public endpoints. Purchase creates money, so it gets a much tighter
 * budget than the invite landing page's 60/min.
 */
const BUY_LIMIT_WINDOW_MS = 60_000;
const BUY_LIMIT_MAX = 10;
/**
 * Reading the storefront is not creating money, so it gets its own, far larger
 * budget. It used to share the purchase budget above, which meant that simply
 * reloading the store page could spend the allowance reserved for checkout and
 * lock a genuine buyer out with a 429 on the purchase they were trying to make.
 */
const READ_LIMIT_WINDOW_MS = 60_000;
const READ_LIMIT_MAX = 120;
const buyHits = new Map<string, number[]>();
const readHits = new Map<string, number[]>();

/**
 * Test-only: clear both per-IP storefront limiters.
 *
 * The purchase budget is 10 requests/min per IP, which is right for a public
 * endpoint and wrong for a test suite that makes dozens of calls from 127.0.0.1.
 * Without this the suite's pass/fail depended on how many requests earlier tests
 * happened to spend, so adding an unrelated test could break an unrelated one.
 */
export function resetBuyRateLimitForTests(): void {
  buyHits.clear();
  readHits.clear();
}

/** Shared sliding-window limiter; the map decides which budget is being spent. */
function perIpLimiter(
  hits: Map<string, number[]>,
  windowMs: number,
  max: number,
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    const ip = req.ip ?? "unknown";
    const now = Date.now();
    const recent = (hits.get(ip) ?? []).filter((t) => t > now - windowMs);
    if (recent.length >= max) {
      hits.set(ip, recent);
      res.status(429).json({ success: false, error: "Too many attempts. Please try again shortly." });
      return;
    }
    recent.push(now);
    hits.set(ip, recent);
    next();
  };
}

const buyRateLimit = perIpLimiter(buyHits, BUY_LIMIT_WINDOW_MS, BUY_LIMIT_MAX);
const readRateLimit = perIpLimiter(readHits, READ_LIMIT_WINDOW_MS, READ_LIMIT_MAX);

// One sweeper for both maps, on the longest window. Entries are trimmed against
// each map's own window so the read budget is not cut short by the purchase one.
setInterval(() => {
  const now = Date.now();
  const budgets: Array<[Map<string, number[]>, number]> = [
    [buyHits, BUY_LIMIT_WINDOW_MS],
    [readHits, READ_LIMIT_WINDOW_MS],
  ];
  for (const [hits, windowMs] of budgets) {
    const cutoff = now - windowMs;
    for (const [ip, entries] of hits) {
      const kept = entries.filter((t) => t > cutoff);
      if (kept.length === 0) hits.delete(ip);
      else hits.set(ip, kept);
    }
  }
}, Math.max(BUY_LIMIT_WINDOW_MS, READ_LIMIT_WINDOW_MS)).unref();

/**
 * Guest-capable authentication, mirroring the existing helper in `routes/shop.ts`.
 *
 * `requireAuth` would reject an anonymous buyer outright, which is the wrong
 * default here: registration is invite-only, so someone without an account is
 * exactly the person who needs to buy. A missing header means guest; a *present
* but invalid* one is also treated as guest rather than rejected, matching the shop
 * helper — the purchase itself never touches an account in that case, so there is
 * nothing for a bad token to escalate into.
 */
function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    try {
      const payload = jwt.verify(header.slice(7), getEnv().JWT_SECRET) as {
        userId: string;
        purpose?: string;
      };
      if (payload.purpose === "auth") req.userId = payload.userId;
    } catch {
      // fall through as anonymous
    }
  }
  next();
}

const purchaseSchema = z.object({
  quantity: z.number().int().min(1).max(MAX_PACK_QUANTITY),
  method: z.enum(["MANUAL", "STRIPE", "PAYPAL", "CRYPTO"]).default("MANUAL"),
  /** Only meaningful for a guest buyer, who has no account email to fall back on. */
  email: z.string().email().max(320).optional(),
  note: z.string().max(500).optional(),
  coin: z.string().max(10).optional(),
  provider: z.string().max(32).optional(),
});

const claimLinkSchema = z.object({ orderId: z.string().min(1).max(64) });

class PurchaseHttpError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
  }
}

interface StoreState {
  open: boolean;
  currency: string;
  packs: InvitePack[];
}

/**
 * The paid-invite storefront state.
 *
 * Gated on *both* the admin switch and a configured pack list: the switch can hide
 * a store that exists, and the pack list can exist with the switch off, but
 * neither alone can sell a credit. An instance that never set
 * `INVITE_PRICE_PACKS` therefore cannot take money for invites regardless of how
 * the toggle is left.
 */
async function purchaseStore(): Promise<StoreState> {
  const { currency, packs } = invitePackConfig();
  const enabled = await getInvitePurchaseEnabled();
  return { open: packs.length > 0 && enabled, currency, packs };
}

/**
 * Public store configuration.
 *
 * Unauthenticated on purpose: registration is invite-only, so someone without an
 * account is exactly the person who needs to discover that invites are for sale.
 * The resale policy rides along because the checkout states whether the codes may
 * be resold, and the manual-payment instructions ride along because "pay by hand"
 * is worthless to a buyer unless they are told where to send the money.
 */
router.get("/config", readRateLimit, async (_req, res) => {
  const store = await purchaseStore();
  const resale = await getInviteResalePolicy();
  const manualPayment = await getManualPaymentInstructions();

  res.json({
    success: true,
    data: {
      open: store.open,
      currency: store.currency,
      // Listed even while closed so the page can describe the offer without
      // pretending it is purchasable.
      packs: store.packs,
      maxQuantity: MAX_PACK_QUANTITY,
      // `clause` is part of the payload so the storefront states the published
      // position instead of inferring it from `mode`, which would make it print a
      // prohibition for an instance that permits resale.
      resale: { ...resale, clause: resale.clause },
      // Shared with the plan checkout: one set of instructions for the instance.
      manualPayment,
      claimTokenTtlDays: getEnv().PRODUCT_PURCHASE_TOKEN_TTL_DAYS,
      codeTtlDays: getEnv().INVITE_PURCHASE_CODE_TTL_DAYS,
    },
  });
});

/** The signed-in buyer's own purchase history. */
router.get("/me", requireAuth, async (req, res) => {
  const orders = await prisma.invitePurchaseOrder.findMany({
    where: { userId: req.userId! },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  res.json({
    success: true,
    data: { purchases: orders.map(toPurchaseSummary), store: await purchaseStore() },
  });
});

/**
 * Starts a purchase.
 *
 * Auth is optional (see `optionalAuth`): a signed-in buyer is credited to their
 * balance, an anonymous one is emailed real codes. Everything that depends on
 * identity is checked explicitly below rather than implied by the middleware.
 */
router.post("/", buyRateLimit, optionalAuth, async (req, res) => {
  const store = await purchaseStore();
  if (!store.open) {
    return res.status(403).json({ success: false, error: "Invite purchases are not available." });
  }

  const parsed = purchaseSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: "Invalid purchase request." });
  }

  // Only configured quantities may be bought. This is what keeps a volume
  // discount honest: an arbitrary quantity can never be priced at the cheapest
  // per-unit rate, because it simply is not on sale.
  const pack = priceForPackQuantity(store.packs, parsed.data.quantity);
  if (!pack) {
    return res.status(400).json({ success: false, error: "That invite pack is not available." });
  }

  let buyerEmail: string | null = null;
  if (req.userId) {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { inviteBanned: true, email: true },
    });
    if (!user) return res.status(401).json({ success: false, error: "Unauthorized" });
    // A banned account cannot buy: it cannot generate either, so credits would be
    // unspendable except for onward handover, which the ban window already covers
    // for credits paid for before the ban.
    if (user.inviteBanned) {
      return res
        .status(403)
        .json({ success: false, error: "Your account cannot purchase invite credits." });
    }
    buyerEmail = user.email;
  } else {
    buyerEmail = parsed.data.email ?? null;
  }

  if (!buyerEmail) {
    return res.status(400).json({ success: false, error: "An email address is required." });
  }

  // Lazily close out lapsed purchased balances so a stale account cannot keep
  // spending credits whose window has passed.
  await sweepLapsedPurchasedAllowance();

  const method = parsed.data.method;

  // A MANUAL order is only sellable if the buyer is actually told where to send the
  // money. The storefront already hides the option while nothing is configured (see
  // `manualPayment.configured` on /config), so this is the same rule enforced
  // server-side: without it a crafted request could still create a PENDING order that
  // nobody can pay, which the operator would then have to refund by hand.
  if (method === "MANUAL") {
    const { configured } = await getManualPaymentInstructions();
    if (!configured) {
      return res
        .status(400)
        .json({ success: false, error: "Paying by hand is not available right now." });
    }
  }

  const cryptoCoin =
    method === "CRYPTO" ? (parsed.data.coin ?? supportedCoins()[0] ?? "BTC").toUpperCase() : null;
  if (method === "CRYPTO" && cryptoCoin && !supportedCoins().includes(cryptoCoin)) {
    return res.status(400).json({ success: false, error: "Unsupported coin." });
  }

  const id = `${INVITE_PURCHASE_PREFIX}${randomBytes(16).toString("hex")}`;
  const order = await prisma.invitePurchaseOrder.create({
    data: {
      id,
      userId: req.userId ?? null,
      buyerEmail: stripHtml(buyerEmail).slice(0, 320),
      quantity: pack.quantity,
      priceCents: pack.priceCents,
      currency: store.currency,
      method,
      cryptoCoin,
    },
  });

  try {
    if (method === "STRIPE") {
      if (!stripeEnabled()) throw new PurchaseHttpError(400, "Card payments are unavailable.");
      const session = await createStripeCheckout({
        orderId: order.id,
        planLabel: `${pack.quantity} invite credit${pack.quantity === 1 ? "" : "s"}`,
        currency: store.currency,
        amountCents: pack.priceCents,
      });
      await prisma.invitePurchaseOrder.update({
        where: { id: order.id },
        data: {
          gatewayTransactionId: session.sessionId,
          gatewayStatus: "checkout_session.created",
          gatewayCheckoutUrl: session.url,
        },
      });
      return res.status(201).json({
        success: true,
        data: { ...toPurchaseSummary(order), checkout: { url: session.url, provider: "stripe" } },
      });
    }

    if (method === "PAYPAL") {
      if (!paypalEnabled()) throw new PurchaseHttpError(400, "PayPal is unavailable.");
      const pp = await createPayPalOrder({
        orderId: order.id,
        currency: store.currency,
        amountCents: pack.priceCents,
      });
      await prisma.invitePurchaseOrder.update({
        where: { id: order.id },
        data: { gatewayTransactionId: pp.id, gatewayStatus: "CREATED", gatewayCheckoutUrl: pp.approveUrl },
      });
      return res.status(201).json({
        success: true,
        data: { ...toPurchaseSummary(order), checkout: { url: pp.approveUrl, provider: "paypal" } },
      });
    }

    if (method === "CRYPTO") {
      if (!cryptoEnabled()) throw new PurchaseHttpError(400, "Crypto payments are unavailable.");
      if (parsed.data.provider && !getCryptoProvider(parsed.data.provider)) {
        throw new PurchaseHttpError(400, "Unknown crypto provider.");
      }
      const invoice = await createCryptoInvoice({
        providerId: parsed.data.provider,
        // Only a display label for the gateway invoice; the product is credits,
        // not a plan.
        plan: `${pack.quantity} invite credit${pack.quantity === 1 ? "" : "s"}`,
        priceCents: pack.priceCents,
        currency: store.currency,
        orderId: order.id,
        coin: cryptoCoin ?? undefined,
      });
      await prisma.invitePurchaseOrder.update({
        where: { id: order.id },
        data: {
          gatewayTransactionId: invoice.invoiceId,
          gatewayStatus: "new",
          gatewayCheckoutUrl: invoice.url,
          cryptoAmount: invoice.coinAmount != null ? String(invoice.coinAmount) : null,
          cryptoRateUsd: String(invoice.rateUsd),
        },
      });
      return res.status(201).json({
        success: true,
        data: {
          ...toPurchaseSummary(order),
          checkout: { url: invoice.url, provider: invoice.provider, coin: invoice.coin },
        },
      });
    }

    // MANUAL: the owner confirms by hand, so nothing is created here.
    return res.status(201).json({ success: true, data: toPurchaseSummary(order) });
  } catch (err) {
    // Do not leave a payable order behind when no checkout was actually created.
    await prisma.invitePurchaseOrder.delete({ where: { id: order.id } }).catch(() => undefined);
    if (err instanceof PurchaseHttpError) {
      return res.status(err.status).json({ success: false, error: err.message });
    }
    return res
      .status(502)
      .json({ success: false, error: "Could not start the payment. Please try again." });
  }
});

/**
 * The caller's own resellable codes.
 *
 * Read-only by design: where resale is permitted, a member may list codes they
 * generated themselves, which is what makes onward sale possible without the
 * platform becoming a marketplace. Purchased codes are excluded, because they are
 * the ones the resale clause restricts — this returns exactly the set the terms
 * leave the member free to deal with.
 */
router.get("/resellable", requireAuth, async (req, res) => {
  const resale = await getInviteResalePolicy();
  const now = new Date();

  const codes = await prisma.inviteCode.findMany({
    where: {
      createdById: req.userId!,
      purchased: false,
      usedAt: null,
      revokedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    select: { code: true, expiresAt: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  res.json({
    success: true,
    data: {
      mode: resale.mode,
      // `sellingAllowed` is false in the two regulated modes: resale is
      // prohibited in the legal text, and in `enforced` the purchased codes are
      // tracked too. `off` and `permitted` both allow selling; they differ only
      // in whether the instance publishes that permission.
      sellingAllowed: resale.sellingAllowed,
      enforcementActive: resale.enforcementActive,
      codes,
    },
  });
});

/** Guest purchase status and codes.
 *
 * A guest who bought credits before registering has no account, so a scoped claim
 * token (emailed to them) is the only credential. It is verified before anything
 * is revealed — including whether the order exists, so this endpoint cannot be
 * used to probe for order ids.
 */
router.get("/status/:id", readRateLimit, async (req, res) => {
  const token = typeof req.query.token === "string" ? req.query.token : "";
  const orderId = req.params.id;

  const verified = verifyInviteClaimToken(token);
  if (!verified || verified !== orderId) {
    return res.status(403).json({ success: false, error: "This purchase link is not valid." });
  }

  const order = await prisma.invitePurchaseOrder.findUnique({ where: { id: orderId } });
  if (!order) return res.status(404).json({ success: false, error: "Purchase not found." });

  const now = new Date();
  const codes =
    order.status === "PAID"
      ? await prisma.inviteCode.findMany({
          where: {
            note: `invite purchase ${order.id}`,
            purchased: true,
            OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
          },
          select: { code: true, usedAt: true, revokedAt: true },
          orderBy: { createdAt: "asc" },
        })
      : [];

  res.json({
    success: true,
    data: {
      ...toPurchaseSummary(order),
      // Whether the codes email actually went out. A buyer who paid needs to know
      // which situation they are in: delivered to their inbox, or not sent at all
      // (no mail configured) so they should use the link instead of waiting for a
      // message that will never arrive. Stamped only after a confirmed send, and
      // only ever on this buyer's own token-authorised order.
      codesNotifiedAt: order.codesNotifiedAt ? order.codesNotifiedAt.toISOString() : null,
      codes: codes.map((c) => ({
        code: c.code,
        used: c.usedAt !== null,
        revoked: c.revokedAt !== null,
      })),
    },
  });
});

/**
 * Emails the guest their claim link.
 *
 * Answers 200 either way so the endpoint is not an oracle for which order ids
 * exist — a caller cannot distinguish "no such order" from "sent".
 */
router.post("/claim-link", buyRateLimit, async (req, res) => {
  const parsed = claimLinkSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: "Invalid request." });
  }

  const order = await prisma.invitePurchaseOrder.findUnique({ where: { id: parsed.data.orderId } });
  if (!order || !order.buyerEmail) {
    return res.json({ success: true, data: { sent: false } });
  }

  const link = claimUrl(order.id, signInviteClaimToken(order.id, getEnv().PRODUCT_PURCHASE_TOKEN_TTL_DAYS));

  const result = await sendNewsletterEmail({
    to: order.buyerEmail,
    subject: "Your invite credits are ready",
    html:
      "<p>Your invite credits are ready.</p>" +
      `<p><a href="${link}">View your invite codes</a></p>` +
      "<p>If you have not joined yet, use one of these codes to register. " +
      "The remaining codes are added to your account automatically once you do.</p>",
  });

  // Report what actually happened. This used to answer a hardcoded `sent: true`,
  // which told a buyer their link had been re-sent on an instance with SMTP off or
  // with a broken mailbox — the one thing they most need to be told truthfully.
  // The endpoint still always answers 200 and still exposes nothing about whether
  // the order id exists, so it cannot be used to probe for orders.
  if (!result.success) {
    console.error(`Invite claim-link resend failed for order ${order.id}: ${result.error}`);
  }

  res.json({ success: true, data: { sent: result.success } });
});

/** Returns a claim link for a signed-in buyer's own purchase, without emailing. */
router.post("/claim-link-auth", requireAuth, async (req, res) => {
  const parsed = claimLinkSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: "Invalid request." });

  const order = await prisma.invitePurchaseOrder.findUnique({ where: { id: parsed.data.orderId } });
  if (!order || order.userId !== req.userId) {
    return res.status(404).json({ success: false, error: "Purchase not found." });
  }

  const token = signInviteClaimToken(order.id, getEnv().PRODUCT_PURCHASE_TOKEN_TTL_DAYS);
  res.json({ success: true, data: { url: claimUrl(order.id, token) } });
});

function claimUrl(orderId: string, token: string): string {
  const origin = getEnv().APP_URL.replace(/\/+$/, "");
  return `${origin}/invites/purchased/${encodeURIComponent(orderId)}?token=${encodeURIComponent(token)}`;
}

export default router;