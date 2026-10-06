import { Router } from "express";
import { z } from "zod";
import type { Order, OrderMethod } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { getEnv } from "../config/env.js";
import { stripHtml } from "../lib/validation.js";
import { stripeEnabled, createStripeCheckout } from "../lib/payments/stripe.js";
import { paypalEnabled, createPayPalOrder } from "../lib/payments/paypal.js";
import { cryptoEnabled, cryptoProviderIds, createCryptoInvoice } from "../lib/payments/crypto.js";
import { supportedCoins } from "../lib/payments/rates.js";
import { getContactConfig } from "../lib/contactConfig.js";

const router = Router();

export const ORDERS_PERMISSION = "orders.manage";

const TIER_RANK: Record<string, number> = { FREE: 0, PRO: 1, ENTERPRISE: 2 };
const PLAN_LABELS: Record<string, string> = { PRO: "Premium", ENTERPRISE: "Enterprise" };
// Every tier can be named in copy/errors (PLAN_LABELS only covers the paid ones
// because checkout never targets FREE).
const TIER_LABELS: Record<string, string> = { FREE: "Free", PRO: "Premium", ENTERPRISE: "Enterprise" };

export interface OrderPlanPrice {
  plan: "PRO" | "ENTERPRISE";
  label: string;
  priceCents: number;
}

// Local error carrying an HTTP status so the order-creation route can respond
// with the right code (401/409) when the guarded transaction rejects a request
// instead of bubbling a generic 500.
class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function planPrices(): OrderPlanPrice[] {
  const env = getEnv();
  return [
    { plan: "PRO", label: PLAN_LABELS.PRO, priceCents: env.BILLING_PRICE_PRO_CENTS },
    { plan: "ENTERPRISE", label: PLAN_LABELS.ENTERPRISE, priceCents: env.BILLING_PRICE_ENTERPRISE_CENTS },
  ];
}

export function billingConfig() {
  const env = getEnv();
  const plans = planPrices();
  return {
    billingMode: env.BILLING_MODE,
    currency: env.BILLING_CURRENCY,
    plans,
  };
}

export function gatewayConfig() {
  return {
    stripe: stripeEnabled(),
    paypal: paypalEnabled(),
    crypto: {
      enabled: cryptoEnabled(),
      providers: cryptoProviderIds(),
      coins: supportedCoins(),
    },
  };
}

export async function effectiveDiscountPercent(userId: string): Promise<number> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { discountPercent: true, discountExpiresAt: true, referredById: true },
  });
  if (!user) return 0;

  let percent = 0;
  if (user.discountPercent > 0 && (!user.discountExpiresAt || user.discountExpiresAt > new Date())) {
    percent = user.discountPercent;
  }
  if (user.referredById) {
    const inviteeCut = getEnv().AFFILIATE_INVITEE_DISCOUNT_PERCENT;
    if (inviteeCut > percent) percent = inviteeCut;
  }
  return Math.max(0, Math.min(100, percent));
}

export function discountedCents(baseCents: number, discountPercent: number): number {
  if (discountPercent <= 0) return baseCents;
  return Math.max(0, Math.round((baseCents * (100 - discountPercent)) / 100));
}

// Creates a single PENDING order for a user+plan, serialized with a row lock on
// the user so two concurrent checkout requests can never both pass the
// "exactly one PENDING order per plan" guard (TOCTOU between check and create).
export async function createPendingOrder(
  userId: string,
  plan: "PRO" | "ENTERPRISE",
  data: {
    method: OrderMethod;
    currency: string;
    basePriceCents: number;
    discountPercent: number;
    finalPriceCents: number;
    adminNote: string | undefined;
    cryptoCoin: string | null;
  },
): Promise<Order> {
  return prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "users" WHERE "id" = ${userId}::uuid FOR UPDATE
    `;
    if (locked.length === 0) {
      throw new HttpError(401, "Unauthorized");
    }

    const pending = await tx.order.findFirst({
      where: { userId, plan, status: "PENDING" },
      select: { id: true },
    });
    if (pending) {
      throw new HttpError(409, `You already have a pending order for the ${PLAN_LABELS[plan]} plan`);
    }

    return tx.order.create({
      data: {
        userId,
        plan,
        method: data.method,
        status: "PENDING",
        currency: data.currency,
        basePriceCents: data.basePriceCents,
        discountPercent: data.discountPercent,
        finalPriceCents: data.finalPriceCents,
        adminNote: data.adminNote,
        cryptoCoin: data.cryptoCoin,
      },
    });
  });
}

export interface DowngradeResult {
  tier: string;
  previousTier: string;
  cancelledOrders: number;
}

// Self-service tier downgrade, symmetric with the upgrade (checkout) path:
// ENTERPRISE may move to PRO or FREE, PRO may move to FREE. A same-or-higher
// target is rejected — upgrades must go through checkout. Entitlements are
// soft-disabled, never deleted: existing profiles/aliases/tracks/products stay
// in the database (they simply can no longer grow past the lower tier's limit),
// and the enterprise-only surfaces (business SSO config, team seats, webhooks
// API, custom domains) become locked by the normal tier gates. The one active
// side effect is switching off enterprise SSO *enforcement* — otherwise a
// forced-SSO account would be locked out of its own login pages once it no
// longer holds the ENTERPRISE tier that gates the SSO management routes.
//
// Runs inside a transaction with the same `FOR UPDATE` row lock used by
// `createPendingOrder`, so a concurrent checkout cannot race the tier write.
export async function downgradeUserTier(userId: string, target: "PRO" | "FREE"): Promise<DowngradeResult> {
  return prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "users" WHERE "id" = ${userId}::uuid FOR UPDATE
    `;
    if (locked.length === 0) {
      throw new HttpError(401, "Unauthorized");
    }

    const user = await tx.user.findUnique({ where: { id: userId }, select: { tier: true } });
    if (!user) {
      throw new HttpError(401, "Unauthorized");
    }

    // Downgrade only — reject a target at or above the current tier.
    if (TIER_RANK[target] >= TIER_RANK[user.tier]) {
      throw new HttpError(
        400,
        `You are already on the ${TIER_LABELS[user.tier] ?? user.tier} plan. Choose a lower plan to downgrade.`,
      );
    }

    // Switch tier and drop the gifted-enterprise seat cap (only meaningful on
    // ENTERPRISE); paid ENTERPRISE orders stay in history untouched.
    await tx.user.update({ where: { id: userId }, data: { tier: target, seatLimit: null } });

    // A PENDING order would otherwise be able to re-upgrade the account later
    // when its gateway webhook / admin approval arrives, silently undoing the
    // downgrade, so cancel any outstanding order as part of the move.
    const cancelled = await tx.order.updateMany({ where: { userId, status: "PENDING" }, data: { status: "CANCELLED" } });

    // Leaving ENTERPRISE must not leave SSO enforcement on: the SSO management
    // routes require the enterprise API level, so an enforced account could no
    // longer configure or remove it. Keep the stored provider config (so an
    // upgrade restores it) but stop forcing SSO sign-in.
    await tx.enterpriseSso.updateMany({ where: { userId, enforced: true }, data: { enforced: false } });

    return { tier: target, previousTier: user.tier, cancelledOrders: cancelled.count };
  });
}

function orderToDto(order: {
  id: string;
  plan: string;
  method: string;
  status: string;
  currency: string;
  basePriceCents: number;
  discountPercent: number;
  finalPriceCents: number;
  adminNote: string | null;
  gatewayTransactionId: string | null;
  gatewayStatus: string | null;
  gatewayCheckoutUrl: string | null;
  cryptoCoin: string | null;
  cryptoAmount: unknown;
  cryptoRateUsd: unknown;
  paidAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: order.id,
    plan: order.plan,
    planLabel: PLAN_LABELS[order.plan] ?? order.plan,
    method: order.method,
    status: order.status,
    currency: order.currency,
    basePriceCents: order.basePriceCents,
    discountPercent: order.discountPercent,
    finalPriceCents: order.finalPriceCents,
    adminNote: order.adminNote,
    gatewayTransactionId: order.gatewayTransactionId,
    gatewayStatus: order.gatewayStatus,
    gatewayCheckoutUrl: order.gatewayCheckoutUrl,
    cryptoCoin: order.cryptoCoin,
    cryptoAmount: order.cryptoAmount == null ? null : String(order.cryptoAmount),
    cryptoRateUsd: order.cryptoRateUsd == null ? null : String(order.cryptoRateUsd),
    paidAt: order.paidAt,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };
}

router.get("/config", async (_req, res) => {
  res.json({ success: true, data: { ...billingConfig(), gateways: gatewayConfig(), contact: await getContactConfig() } });
});

router.get("/me", requireAuth, async (req, res) => {
  const userId = req.userId!;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { tier: true } });
  if (!user) {
    return res.status(401).json({ success: false, error: "Unauthorized" });
  }

  const [orders, discountPercent] = await Promise.all([
    prisma.order.findMany({ where: { userId }, orderBy: { createdAt: "desc" } }),
    effectiveDiscountPercent(userId),
  ]);

  res.json({
    success: true,
    data: {
      currentTier: user.tier,
      discountPercent,
      billing: billingConfig(),
      orders: orders.map(orderToDto),
    },
  });
});

const createOrderSchema = z.object({
  plan: z.enum(["PRO", "ENTERPRISE"]),
  method: z.enum(["MANUAL", "STRIPE", "PAYPAL", "CRYPTO"]).default("MANUAL"),
  note: z.string().max(500).optional(),
  coin: z.string().max(10).optional(),
  provider: z.string().max(32).optional(),
});

router.post("/me", requireAuth, async (req, res) => {
  const parsed = createOrderSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: parsed.error.issues[0].message });
  }

  const { plan, method, note } = parsed.data;
  const userId = req.userId!;

  if (method === "STRIPE" && !stripeEnabled()) {
    return res.status(400).json({ success: false, error: "Card payments are not enabled on this instance" });
  }
  if (method === "PAYPAL" && !paypalEnabled()) {
    return res.status(400).json({ success: false, error: "PayPal is not enabled on this instance" });
  }
  if (method === "CRYPTO" && !cryptoEnabled()) {
    return res.status(400).json({ success: false, error: "Crypto payments are not enabled on this instance" });
  }

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { tier: true } });
  if (!user) {
    return res.status(401).json({ success: false, error: "Unauthorized" });
  }
  if (TIER_RANK[plan] <= TIER_RANK[user.tier]) {
    return res.status(400).json({ success: false, error: `You already have the ${PLAN_LABELS[plan]} plan` });
  }

  const discountPercent = await effectiveDiscountPercent(userId);
  const planPrice = planPrices().find((p) => p.plan === plan);
  const basePriceCents = planPrice?.priceCents ?? 0;
  const finalPriceCents = discountedCents(basePriceCents, discountPercent);
  const currency = getEnv().BILLING_CURRENCY;
  const cleanNote = note != null ? stripHtml(note).slice(0, 500) : undefined;
  const cryptoCoin = method === "CRYPTO" ? (supportedCoins().includes((parsed.data.coin ?? "").toUpperCase()) ? parsed.data.coin!.toUpperCase() : supportedCoins()[0]) : null;

  // Serialize per-user order creation with a row lock so two concurrent
  // checkout requests cannot both pass the "one PENDING order per plan" gate
  // and both create a pending order (TOCTOU between findFirst and create).
  let order: Awaited<ReturnType<typeof createPendingOrder>>;
  try {
    order = await createPendingOrder(userId, plan, {
      method,
      currency,
      basePriceCents,
      discountPercent,
      finalPriceCents,
      adminNote: cleanNote,
      cryptoCoin,
    });
  } catch (err) {
    if (err instanceof HttpError) {
      return res.status(err.status).json({ success: false, error: err.message });
    }
    throw err;
  }

  try {
    if (method === "STRIPE") {
      const session = await createStripeCheckout({
        orderId: order.id,
        planLabel: PLAN_LABELS[plan],
        currency,
        amountCents: finalPriceCents,
      });
      await prisma.order.update({ where: { id: order.id }, data: { gatewayTransactionId: session.sessionId, gatewayStatus: "checkout_session.created", gatewayCheckoutUrl: session.url } });
      return res.status(201).json({ success: true, data: orderToDto({ ...order, gatewayTransactionId: session.sessionId, gatewayStatus: "checkout_session.created", gatewayCheckoutUrl: session.url, cryptoCoin: null, cryptoAmount: null, cryptoRateUsd: null }), checkout: { url: session.url, provider: "stripe" } });
    }

    if (method === "PAYPAL") {
      const pp = await createPayPalOrder({ orderId: order.id, currency, amountCents: finalPriceCents });
      await prisma.order.update({ where: { id: order.id }, data: { gatewayTransactionId: pp.id, gatewayStatus: "CREATED", gatewayCheckoutUrl: pp.approveUrl } });
      return res.status(201).json({ success: true, data: orderToDto({ ...order, gatewayTransactionId: pp.id, gatewayStatus: "CREATED", gatewayCheckoutUrl: pp.approveUrl, cryptoCoin: null, cryptoAmount: null, cryptoRateUsd: null }), checkout: { url: pp.approveUrl, provider: "paypal" } });
    }

    if (method === "CRYPTO") {
      const invoice = await createCryptoInvoice({
        providerId: parsed.data.provider,
        plan,
        priceCents: finalPriceCents,
        currency,
        orderId: order.id,
        coin: cryptoCoin ?? undefined,
      });
      await prisma.order.update({
        where: { id: order.id },
        data: {
          gatewayTransactionId: invoice.invoiceId,
          gatewayStatus: "new",
          gatewayCheckoutUrl: invoice.url,
          cryptoCoin: invoice.coin,
          cryptoAmount: invoice.coinAmount,
          cryptoRateUsd: String(invoice.rateUsd),
        },
      });
      return res.status(201).json({
        success: true,
        data: orderToDto({
          ...order,
          gatewayTransactionId: invoice.invoiceId,
          gatewayStatus: "new",
          gatewayCheckoutUrl: invoice.url,
          cryptoCoin: invoice.coin,
          cryptoAmount: invoice.coinAmount,
          cryptoRateUsd: String(invoice.rateUsd),
        }),
        checkout: { url: invoice.url, provider: invoice.provider, coin: invoice.coin, coinAmount: invoice.coinAmount, rateUsd: String(invoice.rateUsd) },
      });
    }

    return res.status(201).json({ success: true, data: orderToDto(order) });
  } catch (err) {
    await prisma.order.delete({ where: { id: order.id } }).catch(() => {});
    return res.status(502).json({ success: false, error: (err as Error).message });
  }
});

// Self-service downgrade. Body: { tier: "PRO" | "FREE" }. See
// `downgradeUserTier` for the entitlement/soft-lock semantics.
const downgradeSchema = z.object({
  tier: z.enum(["FREE", "PRO"]),
});

router.post("/downgrade", requireAuth, async (req, res) => {
  const parsed = downgradeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: parsed.error.issues[0].message });
  }

  try {
    const result = await downgradeUserTier(req.userId!, parsed.data.tier);
    res.json({ success: true, data: result });
  } catch (err) {
    if (err instanceof HttpError) {
      return res.status(err.status).json({ success: false, error: err.message });
    }
    throw err;
  }
});

export default router;