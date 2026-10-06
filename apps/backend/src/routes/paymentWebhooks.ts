import { Router, type Request } from "express";
import { verifyStripeWebhook, STRIPE_EVENT_ORDER_ID } from "../lib/payments/stripe.js";
import { verifyPayPalWebhook, paypalEventHandler, shouldCapturePayPalOrder, capturePayPalOrder } from "../lib/payments/paypal.js";
import { getCryptoProvider, cryptoProviderIds } from "../lib/payments/crypto.js";
import { handleGatewayEvent } from "../lib/payments/handleGatewayEvent.js";

const router = Router();

function rawBody(req: Request): Buffer {
  const body = req.body;
  return Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body ?? {}));
}

function reqHeadersAsRecord(req: Request): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(req.headers)) out[k.toLowerCase()] = typeof v === "string" ? v : undefined;
  return out;
}

router.post("/stripe", async (req, res) => {
  const body = rawBody(req);
  const sig = reqHeader(req, "stripe-signature");
  const event = verifyStripeWebhook(body, sig ?? "");
  if (!event) return res.status(400).json({ received: false, error: "Invalid signature" });

  const type = event.type;
  const orderId = STRIPE_EVENT_ORDER_ID(event);
  // A `checkout.session.completed` event fires as soon as the session closes,
  // which for card payments means funds were captured. But delayed / async
  // payment methods (bank debit, iDEAL, etc.) close the session *before* the
  // money has actually moved: `payment_status` stays `unpaid`/`processing` and
  // the real success arrives later as `checkout.session.async_payment_succeeded`.
  // Fulfilling on a session simply closing would grant paid perks for money
  // that never settled, so only honor sessions whose payment is already "paid".
  const paymentStatus = (event.data.object as Record<string, unknown> | undefined)?.payment_status;
  if (type === "checkout.session.completed") {
    if (paymentStatus === "paid") {
      await handleGatewayEvent(orderId, "paid", String(event.data.object.id ?? ""));
    }
  } else if (type === "checkout.session.async_payment_succeeded") {
    await handleGatewayEvent(orderId, "paid", String(event.data.object.id ?? ""));
  } else if (type === "checkout.session.async_payment_failed" || type === "checkout.session.expired") {
    await handleGatewayEvent(orderId, "cancelled");
  }
  res.json({ received: true });
});

router.post("/paypal", async (req, res) => {
  const body = rawBody(req);
  const headers = reqHeadersAsRecord(req);
  let parsed: { event_type?: string; resource?: { id?: string; custom_id?: string } };
  try {
    parsed = JSON.parse(body.toString());
  } catch {
    return res.status(400).json({ received: false, error: "Invalid JSON" });
  }
  const ok = await verifyPayPalWebhook(headers, parsed).catch(() => false);
  if (!ok) return res.status(400).json({ received: false, error: "Invalid signature" });

  const kind = paypalEventHandler(parsed.event_type ?? "");
  const orderId = parsed.resource?.custom_id ?? null;

  // An approved PayPal order has not been paid yet: with intent CAPTURE the
  // merchant must capture it server-side. Do that now and derive the outcome
  // from the capture response; PAYMENT.CAPTURE.COMPLETED arrives afterwards and
  // is handled idempotently by handleGatewayEvent.
  if (shouldCapturePayPalOrder(parsed.event_type ?? "") && orderId && parsed.resource?.id) {
    try {
      const capture = await capturePayPalOrder(parsed.resource.id);
      const captured = capture?.status === "COMPLETED";
      await handleGatewayEvent(orderId, captured ? "paid" : "cancelled", captured ? capture.captureId : undefined);
    } catch {
      await handleGatewayEvent(orderId, "cancelled");
    }
    return res.json({ received: true });
  }

  await handleGatewayEvent(orderId, kind, parsed.resource?.id);
  res.json({ received: true });
});

router.post("/crypto/:provider", async (req, res) => {
  const providerId = req.params.provider.toLowerCase();
  if (!cryptoProviderIds().includes(providerId)) {
    return res.status(404).json({ received: false, error: "Unknown crypto provider" });
  }
  const provider = getCryptoProvider(providerId);
  if (!provider) return res.status(503).json({ received: false, error: "Provider not configured" });

  const body = rawBody(req);
  const event = provider.verifyWebhook(body, reqHeadersAsRecord(req));
  if (!event) return res.status(400).json({ received: false, error: "Invalid signature" });

  const kind = provider.eventKind(event);
  const orderId = provider.orderIdOf(event);
  await handleGatewayEvent(orderId, kind);
  res.json({ received: true });
});

function reqHeader(req: Request, name: string): string | undefined {
  const v = req.headers[name];
  return typeof v === "string" ? v : undefined;
}

export default router;