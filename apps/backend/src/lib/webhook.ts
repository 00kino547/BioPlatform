import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomUUID } from "crypto";
import dns from "node:dns/promises";
import https from "node:https";
import net from "node:net";
import type { LookupOptions } from "node:dns";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";
import { getEnv } from "../config/env.js";

export const WEBHOOK_EVENTS = [
  "profile.viewed",
  "link.clicked",
  "profile.updated",
  "profile.created",
  "profile.deleted",
  "user.registered",
  "user.updated",
  "user.deleted",
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
    url.protocol === "https:" &&
    !url.username &&
    !url.password
  );
}

const privateNetworks = new net.BlockList();
privateNetworks.addRange("0.0.0.0", "0.255.255.255", "ipv4");
privateNetworks.addRange("10.0.0.0", "10.255.255.255", "ipv4");
privateNetworks.addRange("100.64.0.0", "100.127.255.255", "ipv4");
privateNetworks.addRange("127.0.0.0", "127.255.255.255", "ipv4");
privateNetworks.addRange("169.254.0.0", "169.254.255.255", "ipv4");
privateNetworks.addRange("172.16.0.0", "172.31.255.255", "ipv4");
privateNetworks.addRange("192.0.0.0", "192.0.0.255", "ipv4");
privateNetworks.addRange("192.0.2.0", "192.0.2.255", "ipv4");
privateNetworks.addRange("192.88.99.0", "192.88.99.255", "ipv4");
privateNetworks.addRange("192.168.0.0", "192.168.255.255", "ipv4");
privateNetworks.addRange("198.18.0.0", "198.19.255.255", "ipv4");
privateNetworks.addRange("198.51.100.0", "198.51.100.255", "ipv4");
privateNetworks.addRange("203.0.113.0", "203.0.113.255", "ipv4");
privateNetworks.addRange("224.0.0.0", "239.255.255.255", "ipv4");
privateNetworks.addRange("240.0.0.0", "255.255.255.255", "ipv4");
privateNetworks.addAddress("::", "ipv6");
privateNetworks.addAddress("::1", "ipv6");
privateNetworks.addRange("2001:db8::", "2001:db8:ffff:ffff:ffff:ffff:ffff:ffff", "ipv6");
privateNetworks.addRange("64:ff9b::", "64:ff9b:ffff:ffff:ffff:ffff:ffff:ffff", "ipv6");
privateNetworks.addRange("fc00::", "fdff:ffff:ffff:ffff:ffff:ffff:ffff:ffff", "ipv6");
privateNetworks.addRange("fe80::", "febf:ffff:ffff:ffff:ffff:ffff:ffff:ffff", "ipv6");
privateNetworks.addRange("fec0::", "feff:ffff:ffff:ffff:ffff:ffff:ffff:ffff", "ipv6");
privateNetworks.addRange("ff00::", "ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff", "ipv6");

function isPrivateIpAddress(address: string): boolean {
  if (net.isIP(address) === 0) return true;
  return privateNetworks.check(address, net.isIPv6(address) ? "ipv6" : "ipv4");
}

interface PublicHostResolution {
  hostname: string;
  address: string;
  family: number;
}

async function resolvePublicWebhookHost(hostname: string): Promise<PublicHostResolution | null> {
  try {
    const addresses = await Promise.race([
      dns.lookup(hostname, { all: true, verbatim: true }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("DNS lookup timed out")), 3000)
      ),
    ]);
    if (addresses.length === 0) return null;
    if (!addresses.every((entry) => !isPrivateIpAddress(entry.address))) return null;
    return { hostname, address: addresses[0].address, family: addresses[0].family };
  } catch {
    return null;
  }
}

async function isSafeWebhookTarget(
  value: string
): Promise<{ ok: true; resolution: PublicHostResolution } | { ok: false; error: string }> {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { ok: false, error: "Invalid webhook target URL" };
  }
  if (url.protocol !== "https:") {
    return { ok: false, error: "Webhook URLs must use https" };
  }
  const resolution = await resolvePublicWebhookHost(url.hostname);
  if (!resolution) {
    return { ok: false, error: "Webhook target must resolve to a public address" };
  }
  return { ok: true, resolution };
}

const DISCORD_WEBHOOK_HOSTS = new Set(["discord.com", "discordapp.com", "ptb.discord.com", "canary.discord.com"]);
const DISCORD_WEBHOOK_PATH = /^\/api\/webhooks\/[^/]+\/[^/]+\/?$/;
const DISCORD_MESSAGE_KEYS = ["content", "embeds", "username", "avatar_url", "components", "attachments", "poll"];

export function isDiscordWebhookUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return DISCORD_WEBHOOK_HOSTS.has(url.hostname) && DISCORD_WEBHOOK_PATH.test(url.pathname);
}

function isDiscordMessageShape(payload: unknown): boolean {
  if (typeof payload !== "object" || payload === null) return false;
  const record = payload as Record<string, unknown>;
  return DISCORD_MESSAGE_KEYS.some((key) => key in record);
}

const EMBED_COLOR = 0x8b5cf6;
const MAX_EMBED_DESCRIPTION = 4096;
const MAX_FIELD_NAME = 256;
const MAX_FIELD_VALUE = 1024;
const MAX_FIELDS = 25;
const MAX_FOOTER = 2048;

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 3)}...` : value;
}

function stringifyValue(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  const json = JSON.stringify(value);
  return json === undefined ? "undefined" : json;
}

function isWebhookPayloadShape(payload: unknown): payload is WebhookPayload {
  if (typeof payload !== "object" || payload === null) return false;
  const record = payload as Record<string, unknown>;
  return typeof record.event === "string" && typeof record.timestamp === "string";
}

function buildDiscordEmbed(payload: unknown): Record<string, unknown> {
  const embed: Record<string, unknown> = { color: EMBED_COLOR };
  const fields: Array<{ name: string; value: string; inline: boolean }> = [];

  if (isWebhookPayloadShape(payload)) {
    embed.title = truncate(`BioPlatform · ${payload.event}`, 256);
    embed.timestamp = payload.timestamp;
    if (payload.data && typeof payload.data === "object") {
      for (const [key, value] of Object.entries(payload.data)) {
        if (fields.length >= MAX_FIELDS) break;
        fields.push({
          name: truncate(key, MAX_FIELD_NAME),
          value: truncate(stringifyValue(value), MAX_FIELD_VALUE),
          inline: true,
        });
      }
    }
    if (payload.id) {
      embed.footer = { text: truncate(`Delivery ${payload.id}`, MAX_FOOTER) };
    }
  } else {
    embed.description = truncate(JSON.stringify(payload, null, 2), MAX_EMBED_DESCRIPTION);
  }

  if (fields.length > 0) embed.fields = fields;
  return { embeds: [embed] };
}

export function toDiscordMessage(payload: unknown): unknown {
  if (isDiscordMessageShape(payload)) return payload;
  return buildDiscordEmbed(payload);
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

export function isValidPayloadTemplate(template: string): boolean {
  if (typeof template !== "string" || template.length === 0 || template.length > 2000) return false;
  const sample = template.replace(/\{\{\s*[a-zA-Z0-9_.]+\s*\}\}/g, "null");
  try {
    JSON.parse(sample);
    return true;
  } catch {
    return false;
  }
}

function templateValue(value: unknown): string {
  if (value === undefined) return "null";
  return JSON.stringify(value);
}

function resolveDataPath(data: Record<string, unknown>, path: string): unknown {
  let current: unknown = data;
  for (const part of path.split(".")) {
    if (current === null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

export function renderPayloadTemplate(template: string, payload: WebhookPayload): unknown {
  const rendered = template.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (match, path) => {
    if (path === "id") return templateValue(payload.id);
    if (path === "event") return templateValue(payload.event);
    if (path === "timestamp") return templateValue(payload.timestamp);
    if (path === "data") return templateValue(payload.data);
    if (path.startsWith("data.")) return templateValue(resolveDataPath(payload.data, path.slice(5)));
    return match;
  });
  return JSON.parse(rendered);
}

interface WebhookHttpResponse {
  status: number;
  location: string | null;
}

function requestWebhook(
  target: string,
  resolution: PublicHostResolution,
  headers: Record<string, string>,
  body: string,
  timeoutMs: number
): Promise<WebhookHttpResponse> {
  const url = new URL(target);
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: url.hostname,
        port: url.port === "" ? 443 : Number(url.port),
        path: `${url.pathname}${url.search}`,
        method: "POST",
        headers,
        servername: url.hostname,
        rejectUnauthorized: true,
        timeout: timeoutMs,
        lookup: (_hostname: string, opts: LookupOptions, callback) => {
          if (opts.all === true) {
            callback(null, [{ address: resolution.address, family: resolution.family }]);
          } else {
            callback(null, resolution.address, resolution.family);
          }
        },
      },
      (res) => {
        res.resume();
        const location = typeof res.headers.location === "string" ? res.headers.location : null;
        resolve({ status: res.statusCode ?? 0, location });
      }
    );
    req.on("timeout", () => req.destroy(new Error("Webhook delivery timed out")));
    req.on("error", reject);
    req.end(body);
  });
}

async function deliver(
  webhook: { id: string; url: string; secretEncrypted: string },
  delivery: { id: string },
  event: string,
  payload: unknown
): Promise<{ success: boolean; status: number | null; error: string | null; nextRetryAt: Date | null }> {
  const secret = decryptSecret(webhook.secretEncrypted);

  let redirects = 0;
  let url = webhook.url;
  const deadline = Date.now() + DELIVERY_TIMEOUT_MS;
  try {
    let status: number | null = null;
    while (true) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        return { success: false, status: null, error: "Webhook delivery timed out", nextRetryAt: null };
      }
      const targetCheck = await isSafeWebhookTarget(url);
      if (!targetCheck.ok) {
        return { success: false, status: null, error: targetCheck.error ?? "Webhook target rejected", nextRetryAt: null };
      }
      const body = JSON.stringify(isDiscordWebhookUrl(url) ? toDiscordMessage(payload) : payload);
      const signature = signWebhookPayload(secret, body);
      const response = await requestWebhook(
        url,
        targetCheck.resolution,
        {
          "Content-Type": "application/json",
          "X-BioPlatform-Event": event,
          "X-BioPlatform-Webhook-Id": webhook.id,
          "X-BioPlatform-Delivery-Id": delivery.id,
          "X-BioPlatform-Signature": `sha256=${signature}`,
          "User-Agent": "BioPlatform-Webhook/1.0",
        },
        body,
        Math.min(DELIVERY_TIMEOUT_MS, remaining)
      );
      status = response.status;
      if (status < 300 || status >= 400) break;
      if (redirects >= MAX_REDIRECTS) break;
      if (!response.location) break;
      const next = new URL(response.location, url);
      if (next.protocol !== "https:") break;
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
    return {
      success: false,
      status: null,
      error: err instanceof Error ? err.message : "Webhook delivery failed",
      nextRetryAt: null,
    };
  }
}

export async function attemptDelivery(
  webhook: { id: string; url: string; secretEncrypted: string },
  delivery: { id: string; attempts: number },
  event: string,
  payload: unknown
): Promise<void> {
  const result = await deliver(webhook, delivery, event, payload);

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

export async function dispatchWebhookEventAsync(userId: string, event: WebhookEvent, data: Record<string, unknown>): Promise<void> {
  try {
    const webhooks = await prisma.webhook.findMany({
      where: { userId, active: true, events: { has: event } },
    });
    if (webhooks.length === 0) return;

    const defaultPayload = buildPayload(event, data);
    for (const webhook of webhooks) {
      const payload: unknown = webhook.template
        ? renderPayloadTemplate(webhook.template, defaultPayload)
        : defaultPayload;

      const delivery = await prisma.webhookDelivery.create({
        data: { webhookId: webhook.id, event, payload: payload as Prisma.InputJsonValue },
      });
      await attemptDelivery(webhook, delivery, event, payload);
    }
  } catch (err) {
    console.error("Webhook dispatch failed:", err);
  }
}

export function dispatchWebhookEvent(userId: string, event: WebhookEvent, data: Record<string, unknown>): void {
  void dispatchWebhookEventAsync(userId, event, data);
}

export async function sendTestWebhook(webhookId: string, userId: string): Promise<{ success: boolean; error?: string }> {
  const webhook = await prisma.webhook.findFirst({ where: { id: webhookId, userId } });
  if (!webhook) return { success: false, error: "Webhook not found" };

  const defaultPayload = buildPayload("webhook.test", {
    test: true,
    message: "Test delivery from BioPlatform",
  });
  const payload: unknown = webhook.template
    ? renderPayloadTemplate(webhook.template, defaultPayload)
    : defaultPayload;

  const delivery = await prisma.webhookDelivery.create({
    data: { webhookId: webhook.id, event: "webhook.test", payload: payload as Prisma.InputJsonValue },
  });
  await attemptDelivery(webhook, delivery, "webhook.test", payload);

  const updated = await prisma.webhookDelivery.findUnique({ where: { id: delivery.id } });
  if (!updated || updated.status !== "success") {
    return { success: false, error: updated?.lastError ?? "Test delivery failed" };
  }
  return { success: true };
}

let retrySweepRunning = false;

async function retryDueDeliveries(): Promise<void> {
  if (retrySweepRunning) return;
  retrySweepRunning = true;
  try {
    const due = await prisma.webhookDelivery.findMany({
      where: { status: "pending", nextRetryAt: { lte: new Date() } },
      orderBy: { nextRetryAt: "asc" },
      take: 50,
      include: { webhook: true },
    });
    for (const delivery of due) {
      if (!delivery.webhook.active) continue;
      const payload = delivery.payload as unknown;
      await attemptDelivery(delivery.webhook, delivery, delivery.event, payload);
    }
  } catch (err) {
    console.error("Webhook retry sweep failed:", err);
  } finally {
    retrySweepRunning = false;
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
