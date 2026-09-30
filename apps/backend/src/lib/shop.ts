import fs from "fs";
import path from "path";
import jwt from "jsonwebtoken";
import type { UserTier } from "@prisma/client";
import { getEnv } from "../config/env.js";
import { prisma } from "./prisma.js";
import { sendNewsletterEmail } from "./newsletter.js";
import { getPrimaryStorageProvider } from "./storage/index.js";
import { resolveUploadAbs, originalsCachePath } from "./mediaStore.js";

export const PRODUCT_UPLOAD_SUBDIR = "products";
export const SHOP_PURCHASE_PREFIX = "purchase-";

export function getProductLimit(tier: UserTier): number | null {
  if (tier === "FREE") return 3;
  return null;
}

export function discountedCents(baseCents: number, discountPercent: number): number {
  const safe = Math.max(0, Math.min(100, discountPercent || 0));
  return Math.max(0, Math.round((baseCents * (100 - safe)) / 100));
}

export function productUploadsDir(): string {
  return path.join(path.resolve(getEnv().LOCAL_STORAGE_PATH), PRODUCT_UPLOAD_SUBDIR);
}

export function productFileKey(fileName: string): string {
  return `${PRODUCT_UPLOAD_SUBDIR}/${path.basename(fileName)}`;
}

export async function publishProductUpload(fileName: string): Promise<void> {
  const provider = getPrimaryStorageProvider();
  if (provider.kind === "local") return;
  const tempAbs = resolveUploadAbs(productFileKey(fileName));
  if (!tempAbs) return;
  const data = await fs.promises.readFile(tempAbs).catch(() => null);
  if (!data) return;
  await provider.writeObject(productFileKey(fileName), data);
  await fs.promises.unlink(tempAbs).catch(() => undefined);
}

export async function deleteProductUpload(fileName: string): Promise<void> {
  const provider = getPrimaryStorageProvider();
  const key = productFileKey(fileName);
  if (provider.kind !== "local") {
    const tempAbs = resolveUploadAbs(key);
    if (tempAbs) await fs.promises.unlink(tempAbs).catch(() => undefined);
    const cacheFile = originalsCachePath(provider.kind, key);
    if (cacheFile) await fs.promises.unlink(cacheFile).catch(() => undefined);
  }
  await provider.deleteObject(key).catch(() => undefined);
}

export function safeDownloadName(fileName: string): string {
  const clean = fileName
    .split("")
    // Reject path-dangerous punctuation (\,/,:,*,?",<,>,|) and C0 control
    // characters (0x00-0x1f). Kept as a code-point check instead of a literal
    // regex range so eslint's no-control-regex stays satisfied.
    .map((ch) =>
      /[\\/:*?"<>|]/.test(ch) || ch.charCodeAt(0) <= 0x1f ? "_" : ch
    )
    .join("")
    .replace(/^\.+/, "")
    .trim()
    .slice(0, 120);
  return clean || "download";
}

interface DownloadPayload {
  purpose: "product_download";
  purchaseId: string;
}

interface ClientPayload {
  purpose: "product_purchase";
  purchaseId: string;
}

function signPayload(payload: DownloadPayload | ClientPayload, expiresInSeconds: number): string {
  return jwt.sign(payload, getEnv().JWT_SECRET, { expiresIn: expiresInSeconds });
}

export function signDownloadToken(purchaseId: string): string {
  return signPayload({ purpose: "product_download", purchaseId }, getEnv().PRODUCT_DOWNLOAD_TTL_HOURS * 3600);
}

export function verifyDownloadToken(token: string): string | null {
  try {
    const payload = jwt.verify(token, getEnv().JWT_SECRET) as DownloadPayload;
    if (payload.purpose !== "product_download" || typeof payload.purchaseId !== "string") return null;
    return payload.purchaseId;
  } catch {
    return null;
  }
}

export function signClientToken(purchaseId: string): string {
  return signPayload({ purpose: "product_purchase", purchaseId }, getEnv().PRODUCT_PURCHASE_TOKEN_TTL_DAYS * 86400);
}

export function verifyClientToken(token: string): string | null {
  try {
    const payload = jwt.verify(token, getEnv().JWT_SECRET) as ClientPayload;
    if (payload.purpose !== "product_purchase" || typeof payload.purchaseId !== "string") return null;
    return payload.purchaseId;
  } catch {
    return null;
  }
}

export function downloadUrl(purchaseId: string): string {
  const origin = getEnv().APP_URL.replace(/\/+$/, "");
  return `${origin}/api/shop/download/${encodeURIComponent(purchaseId)}?token=${encodeURIComponent(signDownloadToken(purchaseId))}`;
}

export function shopReturnUrl(username: string, purchaseId: string, status: string): string {
  const origin = getEnv().APP_URL.replace(/\/+$/, "");
  return `${origin}/${encodeURIComponent(username)}?shop=purchase&id=${encodeURIComponent(purchaseId)}&status=${status}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildPurchaseEmail(opts: {
  appName: string;
  productTitle: string;
  fileName: string;
  downloadUrl: string;
  sellerName: string;
}): string {
  const { appName, productTitle, fileName, downloadUrl, sellerName } = opts;
  return `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"></head>
    <body style="margin:0;padding:0;background-color:#09090b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
      <div style="max-width:480px;margin:40px auto;background:#18181b;border-radius:12px;border:1px solid #27272a;overflow:hidden;">
        <div style="background:linear-gradient(135deg,#7c3aed,#0ea5e9);padding:24px;text-align:center;">
          <h1 style="color:#fff;margin:0;font-size:18px;">${escapeHtml(appName)}</h1>
        </div>
        <div style="padding:24px;">
          <h2 style="color:#e4e4e7;font-size:16px;margin:0 0 12px;">Your purchase is ready</h2>
          <p style="color:#a1a1aa;font-size:14px;line-height:1.7;margin:0 0 8px;">
            Thank you for buying <strong style="color:#e4e4e7;">${escapeHtml(productTitle)}</strong>
            from ${escapeHtml(sellerName)}.
          </p>
          <p style="color:#a1a1aa;font-size:14px;line-height:1.7;margin:0 0 20px;">
            File: <span style="color:#e4e4e7;">${escapeHtml(fileName)}</span> — your download link is below.
          </p>
          <p style="margin:0 0 20px;">
            <a href="${downloadUrl}" style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#0ea5e9);color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-size:14px;">Download now</a>
          </p>
          <p style="color:#71717a;font-size:12px;line-height:1.6;margin:0;">
            This link expires automatically and can only be used a limited number of times. If you
            lose it, contact the seller to have your order re-sent.
          </p>
        </div>
        <div style="padding:16px 24px;border-top:1px solid #27272a;text-align:center;">
          <p style="color:#52525b;font-size:11px;margin:0;">Sent by ${escapeHtml(appName)}</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

/**
 * Generic text-notification email used by request-type products: the buyer
 * confirmation ("request received") and the seller's new-order summary. The
 * body is trusted to be pre-escaped by the caller.
 */
export function buildRequestEmail(opts: {
  appName: string;
  heading: string;
  body: string;
}): string {
  const { appName, heading, body } = opts;
  return `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"></head>
    <body style="margin:0;padding:0;background-color:#09090b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
      <div style="max-width:480px;margin:40px auto;background:#18181b;border-radius:12px;border:1px solid #27272a;overflow:hidden;">
        <div style="background:linear-gradient(135deg,#7c3aed,#0ea5e9);padding:24px;text-align:center;">
          <h1 style="color:#fff;margin:0;font-size:18px;">${escapeHtml(appName)}</h1>
        </div>
        <div style="padding:24px;">
          <h2 style="color:#e4e4e7;font-size:16px;margin:0 0 12px;">${escapeHtml(heading)}</h2>
          <p style="color:#a1a1aa;font-size:14px;line-height:1.7;margin:0;">${body}</p>
        </div>
        <div style="padding:16px 24px;border-top:1px solid #27272a;text-align:center;">
          <p style="color:#52525b;font-size:11px;margin:0;">Sent by ${escapeHtml(appName)}</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

/** Account email for a signed-in buyer who did not type one into the dialog. */
export async function accountEmail(userId: string | null | undefined): Promise<string | null> {
  if (!userId) return null;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  return user?.email ?? null;
}

/** Buyer-side confirmation for a submitted request (no download link). */
export async function sendRequestReceivedEmail(email: string, productTitle: string): Promise<void> {
  const appName = getEnv().APP_NAME;
  const html = buildRequestEmail({
    appName,
    heading: "Request received",
    body: `We've let the seller know about <strong>${escapeHtml(productTitle)}</strong>. ` +
          "They will get back to you shortly using the contact details you provided.",
  });
  await sendNewsletterEmail({ to: email, subject: `Your request for ${productTitle} on ${appName}`, html });
}

/** Seller-side summary for a new request order (full buyer email + request text). */
export async function sendRequestNotificationEmail(
  sellerEmail: string,
  opts: { buyerEmail: string; requestText: string; productTitle: string; price: string | null },
): Promise<void> {
  const appName = getEnv().APP_NAME;
  const html = buildRequestEmail({
    appName,
    heading: "New request order",
    body:
      `A buyer wants <strong>${escapeHtml(opts.productTitle)}</strong> from you.` +
      (opts.price ? ` Price: <strong>${escapeHtml(opts.price)}</strong>.` : "") +
      `<p style="margin:12px 0;color:#e4e4e7;font-size:14px;">Buyer email: <a href="mailto:${escapeHtml(opts.buyerEmail)}">${escapeHtml(opts.buyerEmail)}</a></p>` +
      `<p style="margin:12px 0;color:#e4e4e7;font-size:14px;">Their request:</p>` +
      `<blockquote style="margin:0 0 12px;padding:12px;border-left:3px solid #7c3aed;background:#27272a;color:#e4e4e7;border-radius:6px;font-size:14px;">${escapeHtml(opts.requestText)}</blockquote>` +
      "Reply to the buyer's email to agree scope, timing, and delivery.",
  });
  await sendNewsletterEmail({ to: sellerEmail, subject: `New request: ${opts.productTitle} on ${appName}`, html });
}