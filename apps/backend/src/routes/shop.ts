import { Router, type Request, type Response, type NextFunction } from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { z } from "zod";
import type { ProductPurchase, UserTier } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { getEnv } from "../config/env.js";
import { stripHtml } from "../lib/validation.js";
import { profileScope } from "../lib/profile.js";
import { materializeUpload, deleteUpload, writeUpload } from "../lib/mediaStore.js";
import { stripeEnabled, createStripeCheckout } from "../lib/payments/stripe.js";
import { paypalEnabled, createPayPalOrder } from "../lib/payments/paypal.js";
import { cryptoEnabled, cryptoProviderIds, createCryptoInvoice } from "../lib/payments/crypto.js";
import { supportedCoins } from "../lib/payments/rates.js";
import { sendNewsletterEmail } from "../lib/newsletter.js";
import {
  getProductLimit,
  discountedCents,
  productUploadsDir,
  publishProductUpload,
  deleteProductUpload,
  safeDownloadName,
  verifyDownloadToken,
  verifyClientToken,
  signClientToken,
  downloadUrl,
  shopReturnUrl,
  buildPurchaseEmail,
  accountEmail,
  sendRequestReceivedEmail,
  sendRequestNotificationEmail,
  SHOP_PURCHASE_PREFIX,
} from "../lib/shop.js";

const router = Router();

const PRICE_MAX_CENTS = 10_000_000;

// ---- Rate limiting ----------------------------------------------------------

const BUY_LIMIT_MAX = 30;
const BUY_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const STATUS_LIMIT_MAX = 120;
const STATUS_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const DOWNLOAD_LIMIT_MAX = 60;
const DOWNLOAD_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const shopHits = new Map<string, number[]>();

function rateLimit(req: Request, kind: string, max: number, windowMs: number): boolean {
  const key = `${kind}:${req.ip ?? "unknown"}`;
  const now = Date.now();
  const cutoff = now - windowMs;
  const hits = (shopHits.get(key) ?? []).filter((t) => t > cutoff);
  if (hits.length >= max) {
    shopHits.set(key, hits.slice(-(max - 1)));
    return true;
  }
  hits.push(now);
  shopHits.set(key, hits);
  return false;
}

setInterval(() => {
  const cutoff = Date.now() - BUY_LIMIT_WINDOW_MS;
  for (const [key, hits] of shopHits) {
    const remaining = hits.filter((t) => t > cutoff);
    if (remaining.length === 0) shopHits.delete(key);
    else shopHits.set(key, remaining);
  }
}, 30 * 60 * 1000);

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

// ---- Upload middleware ------------------------------------------------------

const PREVIEW_EXTS = new Set([".jpeg", ".jpg", ".png", ".webp", ".gif"]);

const previewUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      fs.mkdirSync(uploadsRoot(), { recursive: true });
      cb(null, uploadsRoot());
    },
    filename: (_req, file, cb) => {
      cb(null, `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase() || ".png"}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (PREVIEW_EXTS.has(path.extname(file.originalname).toLowerCase())) {
      cb(null, true);
    } else {
      cb(new multer.MulterError("LIMIT_UNEXPECTED_FILE", file.fieldname));
    }
  },
});

function uploadsRoot(): string {
  return path.resolve(getEnv().LOCAL_STORAGE_PATH);
}

const productUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      fs.mkdirSync(productUploadsDir(), { recursive: true });
      cb(null, productUploadsDir());
    },
    filename: (_req, file, cb) => {
      cb(null, `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase() || ".bin"}`);
    },
  }),
  limits: { fileSize: getEnv().PRODUCT_FILE_MAX_MB * 1024 * 1024 },
  fileFilter: (_req, _file, cb) => cb(null, true),
});

function handleProductUpload(req: Request, res: Response, next: NextFunction) {
  productUpload.single("file")(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({ success: false, error: `File too large (max ${getEnv().PRODUCT_FILE_MAX_MB}MB)` });
      }
      return res.status(400).json({ success: false, error: `Upload error: ${err.message}` });
    }
    if (err) return res.status(500).json({ success: false, error: "Upload failed" });
    next();
  });
}

function handlePreviewUpload(req: Request, res: Response, next: NextFunction) {
  previewUpload.single("image")(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({ success: false, error: "Preview image too large (max 5MB)" });
      }
      if (err.code === "LIMIT_UNEXPECTED_FILE") {
        return res.status(400).json({ success: false, error: "Invalid preview image. Use JPEG, PNG, GIF, or WebP." });
      }
      return res.status(400).json({ success: false, error: `Upload error: ${err.message}` });
    }
    if (err) return res.status(500).json({ success: false, error: "Upload failed" });
    next();
  });
}

// ---- Schemas ------------------------------------------------------------------

const buySchema = z.object({
  productId: z.string().uuid(),
  method: z.string().optional(),
  email: z.string().email().optional(),
  provider: z.string().optional(),
  coin: z.string().optional(),
  requestText: z.string().max(2000).optional().transform((v) => (v ? stripHtml(v).trim().slice(0, 2000) || null : null)),
});

export const createProductSchema = z.object({
  title: z.string().max(120).transform((v) => stripHtml(v).trim().slice(0, 120)),
  description: z.string().max(2000).optional().transform((v) => (v ? stripHtml(v).trim().slice(0, 2000) || null : null)),
  // priceCents arrives as a string from the SPA FormData payload, so it is
  // coerced to an integer here (0 = free product).
  priceCents: z.coerce.number().int().min(0).max(PRICE_MAX_CENTS),
  type: z.enum(["DOWNLOAD", "REQUEST"]).optional(),
});

export const updateProductSchema = z.object({
  title: z.string().max(120).optional().transform((v) => (v ? stripHtml(v).trim().slice(0, 120) : v)),
  description: z.string().max(2000).nullable().optional().transform((v) => (v ? stripHtml(v).trim().slice(0, 2000) || null : null)),
  priceCents: z.coerce.number().int().min(0).max(PRICE_MAX_CENTS).optional(),
  enabled: z.boolean().optional(),
  previewImage: z.string().nullable().optional(),
  type: z.enum(["DOWNLOAD", "REQUEST"]).optional(),
});

function purchaseDto(p: ProductPurchase) {
  return {
    id: p.id,
    productId: p.productId,
    title: p.title,
    fileName: p.fileName,
    fileSize: p.fileSize,
    method: p.method,
    status: p.status,
    currency: p.currency,
    basePriceCents: p.basePriceCents,
    discountPercent: p.discountPercent,
    finalPriceCents: p.finalPriceCents,
    requestText: p.requestText,
    cryptoCoin: p.cryptoCoin,
    cryptoAmount: p.cryptoAmount ? String(p.cryptoAmount) : null,
    cryptoRateUsd: p.cryptoRateUsd ? String(p.cryptoRateUsd) : null,
    gatewayCheckoutUrl: p.gatewayCheckoutUrl,
    paidAt: p.paidAt,
    refundedAt: p.refundedAt,
    createdAt: p.createdAt,
  };
}

async function getOwnedProfile(userId: string, profileId?: unknown) {
  return prisma.profile.findFirst({
    where: profileScope(userId, profileId),
    select: {
      id: true,
      slug: true,
      shopDiscountPercent: true,
      user: { select: { tier: true, username: true } },
    },
  });
}

async function productLimitFor(profileId: string, tier: UserTier): Promise<number | null> {
  const count = await prisma.product.count({ where: { profileId } });
  const limit = getProductLimit(tier);
  if (limit !== null && count >= limit) return limit;
  return null;
}

// ---- Public: gateway + shop availability ----------------------------------------

router.get("/availability", (_req, res) => {
  res.json({
    success: true,
    data: {
      stripe: stripeEnabled(),
      paypal: paypalEnabled(),
      crypto: cryptoEnabled(),
      cryptoProviders: cryptoProviderIds(),
      coins: supportedCoins(),
      currency: getEnv().BILLING_CURRENCY,
      fileMaxMb: getEnv().PRODUCT_FILE_MAX_MB,
    },
  });
});

// ---- Owner: overview + products --------------------------------------------------

router.get("/overview", requireAuth, async (req, res) => {
  const profile = await getOwnedProfile(req.userId!, req.query.profileId);
  if (!profile) return res.status(404).json({ success: false, error: "Profile not found" });

  const [products, sales] = await Promise.all([
    prisma.product.findMany({
      where: { profileId: profile.id },
      orderBy: { createdAt: "asc" },
      include: { _count: { select: { purchases: true } } },
    }),
    prisma.productPurchase.findMany({
      where: { product: { profileId: profile.id }, status: "PAID" },
      select: { finalPriceCents: true },
    }),
  ]);
  const revenueCents = sales.reduce((sum, s) => sum + s.finalPriceCents, 0);

  res.json({
    success: true,
    data: {
      profileId: profile.id,
      slug: profile.slug,
      tier: profile.user.tier,
      limit: getProductLimit(profile.user.tier),
      discountPercent: profile.shopDiscountPercent ?? 0,
      totalSold: sales.length,
      revenueCents,
      currency: getEnv().BILLING_CURRENCY,
      products: products.map((p) => ({
        id: p.id,
        title: p.title,
        description: p.description,
        priceCents: p.priceCents,
        type: p.type,
        enabled: p.enabled,
        previewImage: p.previewImage,
        fileName: p.fileName,
        fileSize: p.fileSize,
        purchases: p._count.purchases,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      })),
    },
  });
});

router.post("/products", requireAuth, handleProductUpload, async (req, res) => {
  const profile = await getOwnedProfile(req.userId!, req.query.profileId);
  if (!profile) {
    if (req.file) await fs.promises.unlink(req.file.path).catch(() => undefined);
    return res.status(404).json({ success: false, error: "Profile not found" });
  }

  const limit = await productLimitFor(profile.id, profile.user.tier);
  if (limit !== null) {
    if (req.file) await fs.promises.unlink(req.file.path).catch(() => undefined);
    return res.status(400).json({ success: false, error: `Product limit reached (${limit}). Upgrade your tier to add more products.` });
  }

  const parsed = createProductSchema.safeParse(req.body);
  if (!parsed.success || !parsed.data.title) {
    await fs.promises.unlink(req.file?.path ?? "").catch(() => undefined);
    return res.status(400).json({ success: false, error: parsed.success ? "Product title is required" : parsed.error.issues[0].message });
  }

  const type = parsed.data.type ?? "DOWNLOAD";

  // Download products always ship a file. Request products (custom work the
  // seller fulfils manually) only need a listing — the file is optional.
  if (!req.file && type !== "REQUEST") {
    return res.status(400).json({ success: false, error: "No file uploaded" });
  }

  if (req.file && type === "REQUEST") {
    await fs.promises.unlink(req.file.path).catch(() => undefined);
    return res.status(400).json({ success: false, error: "Request products do not take a delivery file" });
  }

  const fileName = req.file?.filename ?? "";
  const filePath = req.file ? `/uploads/products/${fileName}` : "";
  if (req.file) await publishProductUpload(fileName);

  const product = await prisma.product.create({
    data: {
      profileId: profile.id,
      title: parsed.data.title,
      description: parsed.data.description,
      priceCents: parsed.data.priceCents,
      type,
      filePath,
      fileName: req.file ? safeDownloadName(req.file.originalname) : "",
      fileSize: req.file?.size ?? 0,
    },
  });

  res.status(201).json({ success: true, data: product });
});

router.patch("/products/:id", requireAuth, async (req: Request<{ id: string }>, res) => {
  const parsed = updateProductSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: parsed.error.issues[0].message });
  }

  const product = await prisma.product.findUnique({
    where: { id: req.params.id },
    select: { id: true, profileId: true, profile: { select: { userId: true } } },
  });
  if (!product || product.profile.userId !== req.userId) {
    return res.status(404).json({ success: false, error: "Product not found" });
  }

  if (parsed.data.previewImage !== undefined) {
    const raw = parsed.data.previewImage ?? null;
    if (raw !== null && !/^\/uploads\/[A-Za-z0-9._-]+\.[A-Za-z0-9]+$/.test(raw)) {
      return res.status(400).json({ success: false, error: "Preview image must be a local upload path" });
    }
  }

  const updated = await prisma.product.update({ where: { id: product.id }, data: parsed.data });
  res.json({ success: true, data: updated });
});

router.post("/products/:id/preview", requireAuth, handlePreviewUpload, async (req: Request<{ id: string }>, res) => {
  const product = await prisma.product.findUnique({
    where: { id: req.params.id },
    select: { id: true, profileId: true, previewImage: true, profile: { select: { userId: true } } },
  });
  if (!product || product.profile.userId !== req.userId) {
    if (req.file) await fs.promises.unlink(req.file.path).catch(() => undefined);
    return res.status(404).json({ success: false, error: "Product not found" });
  }
  if (!req.file) {
    return res.status(400).json({ success: false, error: "No image uploaded" });
  }

  const previewRel = `/uploads/${req.file.filename}`;
  await writeUpload(req.file.filename);

  const previous = product.previewImage;
  if (previous && previous.startsWith("/uploads/")) {
    void deleteUpload(path.basename(previous)).catch(() => undefined);
  }

  const updated = await prisma.product.update({ where: { id: product.id }, data: { previewImage: previewRel } });
  res.json({ success: true, data: { previewImage: updated.previewImage } });
});

router.delete("/products/:id", requireAuth, async (req: Request<{ id: string }>, res) => {
  const product = await prisma.product.findUnique({
    where: { id: req.params.id },
    select: { id: true, filePath: true, previewImage: true, profile: { select: { userId: true } } },
  });
  if (!product || product.profile.userId !== req.userId) {
    return res.status(404).json({ success: false, error: "Product not found" });
  }

  if (product.filePath) void deleteProductUpload(path.basename(product.filePath)).catch(() => undefined);
  if (product.previewImage) void deleteUpload(path.basename(product.previewImage)).catch(() => undefined);

  await prisma.product.delete({ where: { id: product.id } });
  res.json({ success: true });
});

// ---- Owner: sales ledger ----------------------------------------------------------

router.get("/sales", requireAuth, async (req, res) => {
  const profile = await getOwnedProfile(req.userId!, req.query.profileId);
  if (!profile) return res.status(404).json({ success: false, error: "Profile not found" });

  const where: Prisma.ProductPurchaseWhereInput = { product: { profileId: profile.id } };
  if (typeof req.query.productId === "string") {
    const owned = await prisma.product.findFirst({ where: { id: req.query.productId, profileId: profile.id }, select: { id: true } });
    if (!owned) return res.status(404).json({ success: false, error: "Product not found" });
    where.productId = req.query.productId;
  }

  const sales = await prisma.productPurchase.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { product: { select: { id: true, title: true, type: true } } },
  });

  res.json({
    success: true,
    data: sales.map((s) => ({
      ...purchaseDto(s),
      product: s.product,
      // The seller's own ledger shows the raw buyer email (it is their order,
      // and request products need a reply-to address) — never masked.
      buyerEmail: s.buyerEmail,
      buyerUserId: s.buyerUserId ?? null,
      isGuest: s.buyerUserId === null,
    })),
  });
});

router.post("/sales/:purchaseId/refund", requireAuth, async (req: Request<{ purchaseId: string }>, res) => {
  const purchase = await prisma.productPurchase.findUnique({
    where: { id: req.params.purchaseId },
    select: { id: true, status: true, product: { select: { profileId: true, profile: { select: { userId: true } } } } },
  });
  if (!purchase || purchase.product.profile.userId !== req.userId) {
    return res.status(404).json({ success: false, error: "Purchase not found" });
  }
  if (purchase.status !== "PAID") {
    return res.status(400).json({ success: false, error: "Only paid purchases can be refunded" });
  }

  const updated = await prisma.productPurchase.update({
    where: { id: purchase.id },
    data: { status: "REFUNDED", refundedAt: new Date(), gatewayStatus: "refunded.manual" },
  });
  res.json({ success: true, data: purchaseDto(updated) });
});

// ---- Buyer: purchases list ---------------------------------------------------------

router.get("/purchases", requireAuth, async (req, res) => {
  const purchases = await prisma.productPurchase.findMany({
    where: { buyerUserId: req.userId! },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { product: { select: { type: true } } },
  });
  res.json({
    success: true,
    data: purchases.map((p) => ({ ...purchaseDto(p), productType: p.product.type })),
  });
});

// ---- Public: buy ---------------------------------------------------------------------

router.post("/buy", optionalAuth, async (req, res) => {
  const parsed = buySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: parsed.error.issues[0].message });
  }

  if (rateLimit(req, "buy", BUY_LIMIT_MAX, BUY_LIMIT_WINDOW_MS)) {
    return res.status(429).json({ success: false, error: "Too many purchase attempts. Please try again later." });
  }

  const product = await prisma.product.findUnique({
    where: { id: parsed.data.productId },
    include: { profile: { select: { id: true, slug: true, shopDiscountPercent: true, user: { select: { username: true, email: true } } } } },
  });
  if (!product || !product.enabled) {
    return res.status(404).json({ success: false, error: "Product not found" });
  }

  const isRequestType = product.type === "REQUEST";
  const isFree = product.priceCents <= 0;

  // Request products always need the buyer's email + the request text, whether
  // they are free or paid — the seller has to know what to deliver.
  if (isRequestType && !req.userId && !parsed.data.email) {
    return res.status(400).json({ success: false, error: "An email is required to submit a request" });
  }
  if (isRequestType && !parsed.data.requestText) {
    return res.status(400).json({ success: false, error: "Please describe what you need" });
  }

  const method = isFree ? "FREE" : (parsed.data.method ?? "").toUpperCase();
  const allowedMethods = new Set(["STRIPE", "PAYPAL", "CRYPTO"]);
  if (!isFree && !allowedMethods.has(method)) {
    return res.status(400).json({ success: false, error: "A payment method is required for this product" });
  }
  if (method === "STRIPE" && !stripeEnabled()) return res.status(400).json({ success: false, error: "Card payments are not enabled" });
  if (method === "PAYPAL" && !paypalEnabled()) return res.status(400).json({ success: false, error: "PayPal is not enabled" });
  if (method === "CRYPTO" && !cryptoEnabled()) return res.status(400).json({ success: false, error: "Crypto payments are not enabled" });

  const currency = getEnv().BILLING_CURRENCY;
  const discountPercent = isFree ? 0 : product.profile.shopDiscountPercent ?? 0;
  const basePriceCents = product.priceCents;
  const finalPriceCents = discountedCents(basePriceCents, discountPercent);

  const buyerEmail = parsed.data.email ? stripHtml(parsed.data.email).toLowerCase().trim() : null;
  const buyerUserId = req.userId ?? null;

  if (!isFree && !buyerUserId && !buyerEmail) {
    return res.status(400).json({ success: false, error: "An email is required to receive your download link" });
  }

  // FREE products are fulfilled immediately, no gateway involved.
  if (isFree) {
    const purchase = await prisma.productPurchase.create({
      data: {
        productId: product.id,
        buyerUserId,
        buyerEmail,
        title: product.title,
        fileName: product.fileName,
        filePath: product.filePath,
        fileSize: product.fileSize,
        method: "FREE",
        status: "PAID",
        currency,
        basePriceCents: 0,
        discountPercent: 0,
        finalPriceCents: 0,
        requestText: isRequestType ? parsed.data.requestText : null,
        paidAt: new Date(),
      },
    });

    if (isRequestType) {
      // Request products have no download: notify the buyer and the seller
      // instead. Guests get the confirmation email; the seller always gets the
      // full order summary (including the buyer's contact + request text).
      const notifyBuyerEmail = buyerEmail ?? await accountEmail(buyerUserId);
      if (notifyBuyerEmail) {
        void sendRequestReceivedEmail(notifyBuyerEmail, product.title).catch(() => undefined);
      }
      void sendRequestNotificationEmail(product.profile.user.email, {
        buyerEmail: notifyBuyerEmail ?? "(anonymous buyer)",
        requestText: parsed.data.requestText!,
        productTitle: product.title,
        price: null,
      }).catch(() => undefined);
    } else if (buyerEmail && !buyerUserId) {
      void sendPurchaseEmail(buyerEmail, purchase, product.profile.user.username).catch(() => undefined);
    }

    return res.status(201).json({
      success: true,
      data: purchaseDto(purchase),
      status: "PAID",
      downloadUrl: isRequestType ? null : downloadUrl(purchase.id),
    });
  }

  const purchase = await prisma.productPurchase.create({
    data: {
      productId: product.id,
      buyerUserId,
      buyerEmail,
      title: product.title,
      fileName: product.fileName,
      filePath: product.filePath,
      fileSize: product.fileSize,
      method: method as "STRIPE" | "PAYPAL" | "CRYPTO",
      status: "PENDING",
      currency,
      basePriceCents,
      discountPercent,
      finalPriceCents,
      requestText: isRequestType ? parsed.data.requestText : null,
      cryptoCoin: method === "CRYPTO" ? pickCryptoCoin(parsed.data.coin) : null,
    },
  });

  const slug = product.profile.slug ?? product.profile.user.username;
  const successUrl = shopReturnUrl(slug, purchase.id, "success");
  const cancelUrl = shopReturnUrl(slug, purchase.id, "cancelled");
  const orderId = `${SHOP_PURCHASE_PREFIX}${purchase.id}`;

  let checkout: { url: string; provider: string; coin?: string; coinAmount?: string; rateUsd?: string };
  try {
    if (method === "STRIPE") {
      const session = await createStripeCheckout({ orderId, planLabel: product.title, currency, amountCents: finalPriceCents, successUrl, cancelUrl });
      await prisma.productPurchase.update({ where: { id: purchase.id }, data: { gatewayTransactionId: session.sessionId, gatewayStatus: "checkout_session.created", gatewayCheckoutUrl: session.url } });
      checkout = { url: session.url, provider: "stripe" };
    } else if (method === "PAYPAL") {
      const pp = await createPayPalOrder({ orderId, currency, amountCents: finalPriceCents, successUrl, cancelUrl });
      await prisma.productPurchase.update({ where: { id: purchase.id }, data: { gatewayTransactionId: pp.id, gatewayStatus: "CREATED", gatewayCheckoutUrl: pp.approveUrl } });
      checkout = { url: pp.approveUrl, provider: "paypal" };
    } else {
      const invoice = await createCryptoInvoice({ providerId: parsed.data.provider, plan: product.title, priceCents: finalPriceCents, currency, orderId, coin: method === "CRYPTO" ? pickCryptoCoin(parsed.data.coin) : undefined });
      await prisma.productPurchase.update({
        where: { id: purchase.id },
        data: {
          gatewayTransactionId: invoice.invoiceId,
          gatewayStatus: "new",
          gatewayCheckoutUrl: invoice.url,
          cryptoCoin: invoice.coin,
          cryptoAmount: invoice.coinAmount,
          cryptoRateUsd: String(invoice.rateUsd),
          invoiceId: invoice.invoiceId,
        },
      });
      checkout = { url: invoice.url, provider: invoice.provider, coin: invoice.coin, coinAmount: invoice.coinAmount, rateUsd: String(invoice.rateUsd) };
    }
  } catch (err) {
    await prisma.productPurchase.delete({ where: { id: purchase.id } }).catch(() => undefined);
    return res.status(502).json({ success: false, error: (err as Error).message });
  }

  const updated = await prisma.productPurchase.findUnique({ where: { id: purchase.id } });
  res.status(201).json({
    success: true,
    data: { ...purchaseDto(updated ?? purchase), gatewayCheckoutUrl: checkout.url },
    checkout: { url: checkout.url, provider: checkout.provider, coin: checkout.coin, coinAmount: checkout.coinAmount, rateUsd: checkout.rateUsd },
    clientToken: buyerUserId ? undefined : signClientToken(purchase.id),
    status: "PENDING",
  });
});

function pickCryptoCoin(coin?: string): string {
  const coins = supportedCoins();
  return coin && coins.includes(coin.toUpperCase()) ? coin.toUpperCase() : coins[0];
}

async function sendPurchaseEmail(email: string, purchase: ProductPurchase, sellerUsername: string): Promise<void> {
  const appName = getEnv().APP_NAME;
  const html = buildPurchaseEmail({
    appName,
    productTitle: purchase.title,
    fileName: purchase.fileName,
    downloadUrl: downloadUrl(purchase.id),
    sellerName: sellerUsername,
  });
  await sendNewsletterEmail({ to: email, subject: `Your ${appName} download is ready`, html });
}

// ---- Public: status polling ------------------------------------------------------------

router.get("/status/:purchaseId", optionalAuth, async (req: Request<{ purchaseId: string }>, res) => {
  if (rateLimit(req, "status", STATUS_LIMIT_MAX, STATUS_LIMIT_WINDOW_MS)) {
    return res.status(429).json({ success: false, error: "Too many requests. Please try again later." });
  }

  const purchase = await prisma.productPurchase.findUnique({
    where: { id: req.params.purchaseId },
    select: {
      id: true,
      status: true,
      paidAt: true,
      refundedAt: true,
      title: true,
      fileName: true,
      fileSize: true,
      finalPriceCents: true,
      method: true,
      buyerUserId: true,
      product: { select: { type: true } },
      createdAt: true,
    },
  });
  if (!purchase) {
    return res.status(404).json({ success: false, error: "Purchase not found" });
  }

  const token = typeof req.query.token === "string" ? req.query.token : null;
  const tokenMatch = token ? verifyClientToken(token) === purchase.id : false;
  const userMatch = req.userId !== undefined && purchase.buyerUserId === req.userId;
  if (!tokenMatch && !userMatch) {
    return res.status(403).json({ success: false, error: "Not authorized to view this purchase" });
  }

  res.json({
    success: true,
    data: {
      id: purchase.id,
      title: purchase.title,
      fileName: purchase.fileName,
      fileSize: purchase.fileSize,
      finalPriceCents: purchase.finalPriceCents,
      method: purchase.method,
      status: purchase.status,
      paidAt: purchase.paidAt,
      refundedAt: purchase.refundedAt,
      createdAt: purchase.createdAt,
    },
    downloadUrl: purchase.status === "PAID" && purchase.product.type === "DOWNLOAD" ? downloadUrl(purchase.id) : null,
  });
});

// ---- Public: download --------------------------------------------------------------------

router.get("/download/:purchaseId", optionalAuth, async (req: Request<{ purchaseId: string }>, res) => {
  if (rateLimit(req, "download", DOWNLOAD_LIMIT_MAX, DOWNLOAD_LIMIT_WINDOW_MS)) {
    return res.status(429).json({ success: false, error: "Too many download attempts. Please try again later." });
  }

  const token = typeof req.query.token === "string" ? req.query.token : null;
  if (token) {
    if (verifyDownloadToken(token) !== req.params.purchaseId) {
      return res.status(403).json({ success: false, error: "Invalid or expired download link" });
    }
  } else if (req.userId === undefined) {
    return res.status(401).json({ success: false, error: "Authentication required" });
  }

  const purchase = await prisma.productPurchase.findUnique({
    where: { id: req.params.purchaseId },
    select: { id: true, status: true, filePath: true, fileName: true, buyerUserId: true, product: { select: { type: true } } },
  });
  if (!purchase) {
    return res.status(404).json({ success: false, error: "Purchase not found" });
  }
  // Request products are fulfilled by the seller manually — there is no file.
  if (purchase.product.type !== "DOWNLOAD") {
    return res.status(400).json({ success: false, error: "This product has no download. Contact the seller about your request." });
  }

  const isBuyer = req.userId !== undefined && purchase.buyerUserId === req.userId;
  if (!isBuyer && token === null) {
    return res.status(403).json({ success: false, error: "Only the buyer can download this file" });
  }
  if (purchase.status !== "PAID") {
    return res.status(purchase.status === "REFUNDED" ? 410 : 402).json({
      success: false,
      error: purchase.status === "REFUNDED" ? "This purchase was refunded" : "Payment is still pending",
    });
  }

  const abs = await materializeUpload(`products/${path.basename(purchase.filePath)}`);
  if (!abs) {
    return res.status(404).json({ success: false, error: "File not found" });
  }

  res.setHeader("Content-Type", "application/octet-stream");
  res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(safeDownloadName(purchase.fileName))}`);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "private, no-store");
  res.sendFile(abs, { dotfiles: "allow" });
});

export default router;