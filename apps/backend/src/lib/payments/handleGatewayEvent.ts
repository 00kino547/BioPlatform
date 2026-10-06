import { prisma } from "../prisma.js";
import { fulfillOrderAsPaid, markOrderCancelled, markOrderRefunded } from "./fulfill.js";
import { SHOP_PURCHASE_PREFIX } from "../shop.js";
import { sendRequestNotificationEmail } from "../shop.js";
import {
  isInvitePurchaseOrderId,
  cancelInvitePurchase,
  fulfillInvitePurchase,
  notifyGuestPurchaseCodes,
  refundInvitePurchase,
} from "../inviteOrders.js";

export async function handleGatewayEvent(
  orderId: string | null,
  kind: "paid" | "refunded" | "cancelled" | null,
  txId?: string,
): Promise<void> {
  if (!orderId || !kind) return;

  if (orderId.startsWith("tip-")) {
    const tipId = orderId.slice(4);
    const tip = await prisma.tip.findUnique({ where: { id: tipId }, select: { id: true, status: true } });
    if (!tip || tip.status === "CONFIRMED") return;
    await prisma.tip.update({
      where: { id: tip.id },
      data: kind === "paid" ? { status: "CONFIRMED", paidAt: new Date() } : { status: "CANCELLED" },
    });
    return;
  }

  // Paid invite credits live in their own table, not `Order`, because a credit
  // purchase is not a plan subscription. Dispatched by prefix alongside the tip
  // and shop namespaces.
  if (isInvitePurchaseOrderId(orderId)) {
    if (kind === "paid") {
      const result = await fulfillInvitePurchase(orderId, {
        transactionId: txId,
        gatewayStatus: kind,
      });
      // Guest buyers get their codes by email; members already have the credits on
      // their balance. Sent after the fulfilment transaction commits so the codes
      // in the message are already durable.
      if (result.credited) {
        await notifyGuestPurchaseCodes(orderId);
      }
      return;
    }
    if (kind === "refunded") {
      await refundInvitePurchase(orderId, { transactionId: txId, gatewayStatus: kind });
      return;
    }
    await cancelInvitePurchase(orderId, { transactionId: txId, gatewayStatus: kind });
    return;
  }

  if (orderId.startsWith(SHOP_PURCHASE_PREFIX)) {
    const purchaseId = orderId.slice(SHOP_PURCHASE_PREFIX.length);
    const purchase = await prisma.productPurchase.findUnique({
      where: { id: purchaseId },
      select: {
        id: true,
        status: true,
        method: true,
        buyerEmail: true,
        requestText: true,
        finalPriceCents: true,
        currency: true,
        product: {
          select: {
            type: true,
            title: true,
            profile: { select: { user: { select: { email: true } } } },
          },
        },
      },
    });
    if (!purchase || purchase.status === "REFUNDED") return;
    if (purchase.status === "PAID" && kind !== "refunded") return;
    const data: Record<string, unknown> = {};
    if (kind === "paid") {
      data.status = "PAID";
      data.paidAt = new Date();
    } else if (kind === "refunded") {
      data.status = "REFUNDED";
      data.refundedAt = new Date();
    } else {
      data.status = "CANCELLED";
    }
    if (txId) data.gatewayTransactionId = txId;
    if (kind) data.gatewayStatus = kind;
    await prisma.productPurchase.update({ where: { id: purchase.id }, data });

    // Paid request-type orders notify the seller with the full order summary;
    // the browser already shows the buyer a confirmation when the payment
    // lands, so no buyer email is fired from here.
    if (kind === "paid" && purchase.product.type === "REQUEST" && purchase.requestText) {
      const sellerEmail = purchase.product.profile.user.email;
      if (sellerEmail) {
        const label = new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: purchase.currency,
        }).format(purchase.finalPriceCents / 100);
        void sendRequestNotificationEmail(sellerEmail, {
          buyerEmail: purchase.buyerEmail ?? "(anonymous buyer)",
          requestText: purchase.requestText,
          productTitle: purchase.product.title,
          price: label,
        }).catch(() => undefined);
      }
    }
    return;
  }

  const order = await prisma.order.findUnique({ where: { id: orderId }, select: { id: true } });
  if (!order) return;
  if (kind === "paid") {
    await fulfillOrderAsPaid(orderId, { transactionId: txId, gatewayStatus: kind });
  } else if (kind === "refunded") {
    await markOrderRefunded(orderId, { transactionId: txId, gatewayStatus: kind });
  } else {
    await markOrderCancelled(orderId, { transactionId: txId, gatewayStatus: kind });
  }
}
