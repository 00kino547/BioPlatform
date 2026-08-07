import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";
import { getEnv } from "../config/env.js";

export const WEBHOOK_EVENTS = [
  "profile.viewed",
  "link.clicked",
  "profile.updated",
] as const;

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export const WEBHOOK_EVENT_SET = new Set<string>(WEBHOOK_EVENTS);

const MAX_ATTEMPTS = 5;
const RETRY_BACKOFFS_SECONDS = [0, 60, 300, 900, 3600];
const DELIVERY_TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 3;
const RETRY_SWEEP_INTERVAL_MS = 5 * 60 * 1000;

function webhookEncryptionKey(): Buffer {
  return createHash("sha256")
    .update("bioplatform:webhook:secret")
    .update(getEnv().JWT_SECRET)
    .digest();
}

export function generateWebhookSecret(): string {
  return randomBytes(32).toString("hex");
}

export function secretPrefix(secret: string): string {
  return secret.slice(0, 8);
}

export function encryptSecret(secret: string): string {
  const key = webhookEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

export function decryptSecret(encoded: string): string {
  const key = webhookEncryptionKey();
  const raw = Buffer.from(encoded, "base64");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const data = raw.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

export function signWebhookPayload(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

export function isValidWebhookUrl(value: string): boolean {
  if (typeof value !== "string" || value.length > 512) return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return (
    (url.protocol === "http:" || url.protocol === "https:") &&
    !url.username &&
    !url.password
  );
}

export interface WebhookPayload {
  id: string;
  event: string;
  timestamp: string;
  data: Record<string, unknown>;
}

function buildPayload(event: string, data: Record<string, unknown>): WebhookPayload {
  return { id: randomUUID(), event, timestamp: new Date().toISOString(), data };
}

async function deliver(
  webhook: { id: string; url: string; secretEncrypted: string },
  delivery: { id: string },
  payload: WebhookPayload
): Promise<{ success: boolean; status: number | null; error: string | null; nextRetryAt: Date | null }> {
  const body = JSON.stringify(payload);
  const secret = decryptSecret(webhook.secretEncrypted);
  const signature = signWebhookPayload(secret, body);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);

  let redirects = 0;
  let url = webhook.url;
  try {
    let status: number | null = null;
    let response: Response | null = null;
    while (true) {
      response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-BioPlatform-Event": payload.event,
          "X-BioPlatform-Webhook-Id": webhook.id,
          "X-BioPlatform-Delivery-Id": delivery.id,
          "X-BioPlatform-Signature": `sha256=${signature}`,
          "User-Agent": "BioPlatform-Webhook/1.0",
        },
        body,
        signal: controller.signal,
      });
      status = response.status;
      if (response.status < 300 || response.status >= 400) break;
      if (redirects >= MAX_REDIRECTS) break;
      const location = response.headers.get("location");
      if (!location) break;
      const next = new URL(location, url);
      if (next.protocol !== "http:" && next.protocol !== "https:") break;
      url = next.toString();
      redirects += 1;
    }

    const ok = status !== null && status >= 200 && status < 300;
    return {
      success: ok,
      status,
      error: ok ? null : `Webhook endpoint returned HTTP ${status}`,
      nextRetryAt: null,
    };
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    return {
      success: false,
      status: null,
      error: aborted ? "Webhook delivery timed out" : err instanceof Error ? err.message : "Webhook delivery failed",
      nextRetryAt: null,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function attemptDelivery(
  webhook: { id: string; url: string; secretEncrypted: string },
  delivery: { id: string; attempts: number },
  payload: WebhookPayload
): Promise<void> {
  const result = await deliver(webhook, delivery, payload);

  if (result.success) {
    await prisma.webhookDelivery.update({
      where: { id: delivery.id },
      data: { status: "success", attempts: delivery.attempts + 1, lastStatusCode: result.status, lastError: null, nextRetryAt: null },
    });
    return;
  }

  const attempts = delivery.attempts + 1;
  const backoff = RETRY_BACKOFFS_SECONDS[Math.min(attempts, RETRY_BACKOFFS_SECONDS.length - 1)];
  if (attempts >= MAX_ATTEMPTS || backoff === undefined) {
    await prisma.webhookDelivery.update({
      where: { id: delivery.id },
      data: { status: "failed", attempts, lastStatusCode: result.status, lastError: result.error, nextRetryAt: null },
    });
    return;
  }

  await prisma.webhookDelivery.update({
    where: { id: delivery.id },
    data: { status: "pending", attempts, lastStatusCode: result.status, lastError: result.error, nextRetryAt: new Date(Date.now() + backoff * 1000) },
  });
}

export function dispatchWebhookEvent(userId: string, event: WebhookEvent, data: Record<string, unknown>): void {
  void (async () => {
    try {
      const webhooks = await prisma.webhook.findMany({
        where: { userId, active: true, events: { has: event } },
      });
      if (webhooks.length === 0) return;

      const payload = buildPayload(event, data);
      for (const webhook of webhooks) {
        const delivery = await prisma.webhookDelivery.create({
          data: { webhookId: webhook.id, event, payload: payload as unknown as Prisma.InputJsonValue },
        });
        await attemptDelivery(webhook, delivery, payload);
      }
    } catch (err) {
      console.error("Webhook dispatch failed:", err);
    }
  })();
}

export async function sendTestWebhook(webhookId: string, userId: string): Promise<{ success: boolean; error?: string }> {
  const webhook = await prisma.webhook.findFirst({ where: { id: webhookId, userId } });
  if (!webhook) return { success: false, error: "Webhook not found" };

  const payload = buildPayload("webhook.test", {
    test: true,
    message: "Test delivery from BioPlatform",
  });

  const delivery = await prisma.webhookDelivery.create({
    data: { webhookId: webhook.id, event: "webhook.test", payload: payload as unknown as Prisma.InputJsonValue },
  });
  await attemptDelivery(webhook, delivery, payload);

  const updated = await prisma.webhookDelivery.findUnique({ where: { id: delivery.id } });
  if (!updated || updated.status !== "success") {
    return { success: false, error: updated?.lastError ?? "Test delivery failed" };
  }
  return { success: true };
}

async function retryDueDeliveries(): Promise<void> {
  try {
    const due = await prisma.webhookDelivery.findMany({
      where: { status: "pending", nextRetryAt: { lte: new Date() } },
      take: 50,
    });
    for (const delivery of due) {
      const webhook = await prisma.webhook.findUnique({ where: { id: delivery.webhookId } });
      if (!webhook || !webhook.active) continue;
      const payload = delivery.payload as unknown as WebhookPayload;
      await attemptDelivery(webhook, delivery, payload);
    }
  } catch (err) {
    console.error("Webhook retry sweep failed:", err);
  }
}

let retrySweepStarted = false;

export function startWebhookRetrySweep(): void {
  if (retrySweepStarted) return;
  retrySweepStarted = true;
  setInterval(() => {
    void retryDueDeliveries();
  }, RETRY_SWEEP_INTERVAL_MS);
}
