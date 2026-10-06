import { Router, type Request } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { profileScope } from "../lib/profile.js";
import { TIP_COINS, tipAmountSchema, tipUri, tipsPaymentMode } from "../lib/tips.js";
import { stripHtml } from "../lib/validation.js";
import { getCryptoProvider } from "../lib/payments/crypto.js";

const router = Router();

const TIP_LIMIT_MAX = 30;
const TIP_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const tipHits = new Map<string, number[]>();

function tipRateLimited(request: Request): boolean {
  const ip = request.ip ?? "unknown";
  const now = Date.now();
  const cutoff = now - TIP_LIMIT_WINDOW_MS;
  const hits = (tipHits.get(ip) ?? []).filter((t) => t > cutoff);
  if (hits.length >= TIP_LIMIT_MAX) {
    tipHits.set(ip, hits);
    return true;
  }
  hits.push(now);
  tipHits.set(ip, hits);
  return false;
}

const createTipSchema = z.object({
  profileId: z.string().uuid(),
  coin: z.enum(TIP_COINS),
  amount: tipAmountSchema,
  name: z
    .string()
    .max(60)
    .transform((v) => stripHtml(v).trim() || undefined)
    .optional(),
  message: z
    .string()
    .max(500)
    .transform((v) => stripHtml(v).trim() || undefined)
    .optional(),
});

router.post("/", async (req, res) => {
  const parsed = createTipSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: parsed.error.issues[0].message });
  }
  const { profileId, coin, amount, name, message } = parsed.data;

  const profile = await prisma.profile.findUnique({
    where: { id: profileId },
    select: { id: true, tipsEnabled: true, tipsBtcAddress: true, tipsLtcAddress: true },
  });
  if (!profile) {
    return res.status(404).json({ success: false, error: "Profile not found" });
  }
  if (!profile.tipsEnabled) {
    return res.status(403).json({ success: false, error: "Tips are not enabled on this profile" });
  }

  const address = coin === "BTC" ? profile.tipsBtcAddress : profile.tipsLtcAddress;
  if (!address) {
    return res.status(403).json({ success: false, error: `This profile does not accept ${coin} tips` });
  }

  if (tipRateLimited(req)) {
    return res.status(429).json({ success: false, error: "Too many requests. Please try again later." });
  }

  const tip = await prisma.tip.create({
    data: { profileId, coin, amount, name, message },
  });

  const provider = getCryptoProvider("btcpayserver");
  if (provider) {
    try {
      const invoice = await provider.createInvoice({
        priceCents: 0,
        currency: "USD",
        coin,
        coinAmount: amount,
        orderId: `tip-${tip.id}`,
      });
      await prisma.tip.update({
        where: { id: tip.id },
        data: { source: "btcpay", invoiceId: invoice.id },
      });
      return res.status(201).json({
        success: true,
        data: {
          tip: { ...tip, source: "btcpay", invoiceId: invoice.id },
          payment: { mode: "btcpay", invoiceId: invoice.id, url: invoice.url },
        },
      });
    } catch {
      // BTCPay unavailable — fall through to address-based intent
    }
  }

  res.status(201).json({
    success: true,
    data: {
      tip: { ...tip },
      payment: { mode: "address", address, uri: tipUri(coin, address, amount) },
    },
  });
});

router.get("/overview", requireAuth, async (req, res) => {
  const profile = await prisma.profile.findFirst({
    where: profileScope(
      req.userId!,
      typeof req.query.profileId === "string" ? (req.query.profileId as string) : undefined,
    ),
    select: { id: true },
  });
  if (!profile) {
    return res.status(404).json({ success: false, error: "Profile not found" });
  }

  const [recent, byCoinStatus] = await Promise.all([
    prisma.tip.findMany({
      where: { profileId: profile.id },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, coin: true, amount: true, name: true, status: true, paidAt: true, createdAt: true },
    }),
    prisma.tip.groupBy({
      by: ["coin", "status"],
      where: { profileId: profile.id },
      _sum: { amount: true },
      _count: { _all: true },
    }),
  ]);

  const totals: Record<string, { confirmedAmount: string; recordedAmount: string; confirmedCount: number; recordedCount: number }> = {};
  for (const g of byCoinStatus) {
    const t = (totals[g.coin] ??= {
      confirmedAmount: "0",
      recordedAmount: "0",
      confirmedCount: 0,
      recordedCount: 0,
    });
    t.recordedAmount = (Number(t.recordedAmount) + Number(g._sum.amount ?? 0)).toFixed(8);
    t.recordedCount += g._count._all;
    if (g.status === "CONFIRMED") {
      t.confirmedAmount = (Number(t.confirmedAmount) + Number(g._sum.amount ?? 0)).toFixed(8);
      t.confirmedCount += g._count._all;
    }
  }

  res.json({ success: true, data: { mode: tipsPaymentMode(), totals, recent } });
});

router.delete("/:id", requireAuth, async (req: Request<{ id: string }>, res) => {
  const profile = await prisma.profile.findFirst({
    where: profileScope(
      req.userId!,
      typeof req.query.profileId === "string" ? (req.query.profileId as string) : undefined,
    ),
    select: { id: true },
  });
  if (!profile) {
    return res.status(404).json({ success: false, error: "Profile not found" });
  }

  const tip = await prisma.tip.findFirst({
    where: { id: req.params.id, profileId: profile.id },
    select: { id: true },
  });
  if (!tip) {
    return res.status(404).json({ success: false, error: "Tip not found" });
  }

  await prisma.tip.delete({ where: { id: tip.id } });
  res.json({ success: true, data: { deleted: 1 } });
});

export default router;
