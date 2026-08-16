import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { requireApiLevel } from "../middleware/admin.js";
import {
  WEBHOOK_EVENT_SET,
  generateWebhookSecret,
  encryptSecret,
  secretPrefix,
  isValidWebhookUrl,
  isValidPayloadTemplate,
  sendTestWebhook,
} from "../lib/webhook.js";
import { requireNoUpdateLockdown } from "../lib/versionCheck.js";

const router = Router();

const TEST_LIMIT = 5;
const TEST_WINDOW_MS = 60 * 1000;
const testHits = new Map<string, number[]>();

const templateSchema = z
  .string()
  .trim()
  .max(2000)
  .optional()
  .nullable()
  .refine((template) => template == null || template.length === 0 || isValidPayloadTemplate(template), {
    message: "Template must be valid JSON with {{placeholders}}",
  })
  .transform((template) => (template ? template : null));

function testRateLimit(userId: string): boolean {
  const now = Date.now();
  const cutoff = now - TEST_WINDOW_MS;
  const hits = (testHits.get(userId) ?? []).filter((t) => t > cutoff);
  if (hits.length >= TEST_LIMIT) {
    testHits.set(userId, hits);
    return true;
  }
  hits.push(now);
  testHits.set(userId, hits);
  return false;
}

setInterval(() => {
  const cutoff = Date.now() - TEST_WINDOW_MS;
  for (const [userId, hits] of testHits) {
    const remaining = hits.filter((t) => t > cutoff);
    if (remaining.length === 0) testHits.delete(userId);
    else testHits.set(userId, remaining);
  }
}, TEST_WINDOW_MS);

router.use(requireAuth);
router.use(requireApiLevel("enterprise"));

const createSchema = z.object({
  name: z.string().trim().min(1).max(64),
  url: z.string().max(512).refine(isValidWebhookUrl, { message: "Invalid webhook URL" }),
  events: z
    .array(z.string())
    .min(1)
    .refine((events) => events.every((e) => WEBHOOK_EVENT_SET.has(e)) && new Set(events).size === events.length, {
      message: "Invalid or duplicate webhook events",
    }),
  template: templateSchema,
  active: z.boolean().default(true),
});

const updateSchema = z.object({
  name: z.string().trim().min(1).max(64).optional(),
  url: z.string().max(512).refine(isValidWebhookUrl, { message: "Invalid webhook URL" }).optional(),
  events: z
    .array(z.string())
    .min(1)
    .refine((events) => events.every((e) => WEBHOOK_EVENT_SET.has(e)) && new Set(events).size === events.length, {
      message: "Invalid or duplicate webhook events",
    })
    .optional(),
  template: templateSchema,
  active: z.boolean().optional(),
});

async function getOwnedWebhook(req: Request, res: Response, id: string) {
  const webhook = await prisma.webhook.findFirst({ where: { id, userId: req.userId! } });
  if (!webhook) {
    res.status(404).json({ success: false, error: "Webhook not found" });
    return null;
  }
  return webhook;
}

function publicWebhook(w: {
  id: string;
  name: string;
  url: string;
  secretPrefix: string;
  active: boolean;
  events: string[];
  template?: string | null;
  createdAt: Date;
  updatedAt: Date;
  lastDelivery?: { status: string; lastStatusCode: number | null; lastError: string | null; updatedAt: Date } | null;
}) {
  return {
    id: w.id,
    name: w.name,
    url: w.url,
    secretPrefix: w.secretPrefix,
    active: w.active,
    events: w.events,
    template: w.template ?? null,
    createdAt: w.createdAt,
    updatedAt: w.updatedAt,
    lastDelivery: w.lastDelivery ?? null,
  };
}

router.get("/", async (req, res) => {
  const webhooks = await prisma.webhook.findMany({
    where: { userId: req.userId! },
    orderBy: { createdAt: "desc" },
    include: {
      deliveries: { orderBy: { createdAt: "desc" }, take: 1, select: { status: true, lastStatusCode: true, lastError: true, updatedAt: true } },
    },
  });

  res.json({ success: true, data: webhooks.map((w) => publicWebhook({ ...w, lastDelivery: w.deliveries[0] ?? null })) });
});

router.post("/", requireNoUpdateLockdown, async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: parsed.error.issues[0].message });
  }

  const existing = await prisma.webhook.count({ where: { userId: req.userId! } });
  if (existing >= 10) {
    return res.status(400).json({ success: false, error: "Maximum of 10 webhooks per account" });
  }

  const secret = generateWebhookSecret();
  const webhook = await prisma.webhook.create({
    data: {
      userId: req.userId!,
      name: parsed.data.name,
      url: parsed.data.url,
      secretEncrypted: encryptSecret(secret),
      secretPrefix: secretPrefix(secret),
      active: parsed.data.active,
      events: parsed.data.events,
      template: parsed.data.template ?? null,
    },
  });

  res.status(201).json({
    success: true,
    data: {
      id: webhook.id,
      name: webhook.name,
      url: webhook.url,
      secret,
      active: webhook.active,
      events: webhook.events,
      template: webhook.template ?? null,
      createdAt: webhook.createdAt,
    },
  });
});

router.patch("/:id", requireNoUpdateLockdown, async (req: Request<{ id: string }>, res) => {
  const webhook = await getOwnedWebhook(req, res, req.params.id);
  if (!webhook) return;

  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: parsed.error.issues[0].message });
  }

  const updated = await prisma.webhook.update({
    where: { id: webhook.id },
    data: parsed.data,
  });

  res.json({
    success: true,
    data: {
      id: updated.id,
      name: updated.name,
      url: updated.url,
      secretPrefix: updated.secretPrefix,
      active: updated.active,
      events: updated.events,
      template: updated.template ?? null,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    },
  });
});

router.post("/:id/rotate-secret", requireNoUpdateLockdown, async (req: Request<{ id: string }>, res) => {
  const webhook = await getOwnedWebhook(req, res, req.params.id);
  if (!webhook) return;

  const secret = generateWebhookSecret();
  await prisma.webhook.update({
    where: { id: webhook.id },
    data: { secretEncrypted: encryptSecret(secret), secretPrefix: secretPrefix(secret) },
  });

  res.json({ success: true, data: { secret, secretPrefix: secretPrefix(secret) } });
});

router.post("/:id/test", async (req: Request<{ id: string }>, res) => {
  const webhook = await getOwnedWebhook(req, res, req.params.id);
  if (!webhook) return;

  if (testRateLimit(req.userId!)) {
    return res.status(429).json({ success: false, error: "Too many test deliveries. Please try again later." });
  }

  const result = await sendTestWebhook(webhook.id, req.userId!);
  if (!result.success) {
    return res.status(400).json({ success: false, error: result.error ?? "Test delivery failed" });
  }
  res.json({ success: true });
});

router.get("/:id/deliveries", async (req: Request<{ id: string }>, res) => {
  const webhook = await getOwnedWebhook(req, res, req.params.id);
  if (!webhook) return;

  const requested = Number(req.query.limit) || 20;
  const limit = Math.min(Math.max(requested, 1), 50);

  const deliveries = await prisma.webhookDelivery.findMany({
    where: { webhookId: webhook.id },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  res.json({ success: true, data: deliveries });
});

router.delete("/:id", requireNoUpdateLockdown, async (req: Request<{ id: string }>, res) => {
  const webhook = await getOwnedWebhook(req, res, req.params.id);
  if (!webhook) return;

  await prisma.webhook.delete({ where: { id: webhook.id } });
  res.json({ success: true });
});

export default router;
