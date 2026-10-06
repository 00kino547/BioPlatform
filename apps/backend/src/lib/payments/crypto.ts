import { createHmac } from "node:crypto";
import { getEnv } from "../../config/env.js";
import { coinUsdRate, quoteCoinAmount, supportedCoins } from "./rates.js";

export interface CryptoProvider {
  id: string;
  createInvoice(params: { priceCents: number; currency: string; coin?: string; coinAmount?: string; orderId: string }): Promise<{ id: string; url: string; coin?: string; coinAmount?: string }>;
  verifyWebhook(payload: Buffer, headers: Record<string, string | undefined>): unknown | null;
  eventKind(event: unknown): "paid" | "refunded" | "cancelled" | null;
  orderIdOf(event: unknown): string | null;
}

export function cryptoEnabled(): boolean {
  const env = getEnv();
  return Boolean(env.CRYPTO_ENABLED && env.CRYPTO_PROVIDERS.length > 0 && (env.BTCPAY_URL || env.BITPAY_API_KEY));
}

export function cryptoProviderIds(): string[] {
  const env = getEnv();
  return env.CRYPTO_PROVIDERS.split(",").map((p) => p.trim().toLowerCase()).filter((p) => p === "btcpayserver" || p === "bitpay");
}

export class BtcPayServerProvider implements CryptoProvider {
  id = "btcpayserver";

  private base(): string {
    const env = getEnv();
    return `${env.BTCPAY_URL.replace(/\/$/, "")}/api/v1`;
  }

  async createInvoice(params: {
    priceCents: number;
    currency: string;
    coin?: string;
    coinAmount?: string;
    orderId: string;
  }): Promise<{ id: string; url: string; coin?: string; coinAmount?: string }> {
    const env = getEnv();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const res = await fetch(`${this.base()}/stores/${env.BTCPAY_STORE_ID}/invoices`, {
        method: "POST",
        headers: {
          Authorization: `token ${env.BTCPAY_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          amount: params.coinAmount ?? (params.priceCents / 100).toFixed(2),
          currency: params.coin ?? params.currency,
          metadata: { orderId: params.orderId },
          checkout: { speedPolicy: "MediumSpeed", requiresRefundEmail: false },
        }),
        signal: controller.signal,
      });
      const json = (await res.json()) as { id?: string; checkoutLink?: string; error?: string; message?: string };
      if (!res.ok) throw new Error(json.error ?? json.message ?? `BTCPay ${res.status}`);
      if (!json.id) throw new Error("BTCPay returned no invoice id");
      return {
        id: json.id,
        url: String(json.checkoutLink ?? `${env.BTCPAY_URL}/i/${json.id}`),
        coin: params.coin,
        coinAmount: params.coinAmount,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string | undefined>): unknown {
    const sig = headers["btcpay-sig"];
    if (!sig) return null;
    const env = getEnv();
    const expected = `sha256=${createHmac("sha256", env.BTCPAY_WEBHOOK_SECRET).update(payload).digest("hex")}`;
    if (sig !== expected) return null;
    try {
      return JSON.parse(payload.toString());
    } catch {
      return null;
    }
  }

  eventKind(event: unknown): "paid" | "refunded" | "cancelled" | null {
    const type = (event as { type?: string })?.type ?? "";
    if (type === "InvoiceSettled" || type === "InvoicePaymentSettled") return "paid";
    if (type === "InvoiceExpired" || type === "InvoiceInvalid") return "cancelled";
    if (type === "InvoiceRefund") return "refunded";
    return null;
  }

  orderIdOf(event: unknown): string | null {
    const metadata = (event as { metadata?: { orderId?: string } })?.metadata;
    return typeof metadata?.orderId === "string" && metadata.orderId ? metadata.orderId : null;
  }
}

export class BitPayProvider implements CryptoProvider {
  id = "bitpay";

  private base(): string {
    return "https://bitpay.com";
  }

  private authHeaders(body: Buffer | string): Record<string, string> {
    const env = getEnv();
    const payload = typeof body === "string" ? body : body.toString();
    return {
      "X-Accept-Version": "2.0.0",
      "X-Identity": env.BITPAY_API_KEY,
      "X-Signature": createHmac("sha512", env.BITPAY_API_KEY).update(payload).digest("hex"),
      "Content-Type": "application/json",
    };
  }

  async createInvoice(params: {
    priceCents: number;
    currency: string;
    coin?: string;
    coinAmount?: string;
    orderId: string;
  }): Promise<{ id: string; url: string; coin?: string; coinAmount?: string }> {
    const body = JSON.stringify({
      price: (params.priceCents / 100).toFixed(2),
      currency: params.currency,
      orderId: params.orderId,
      itemDesc: `BioPlatform plan order ${params.orderId}`,
    });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const res = await fetch(`${this.base()}/invoices`, {
        method: "POST",
        headers: this.authHeaders(body),
        body,
        signal: controller.signal,
      });
      const json = (await res.json()) as { data?: { id?: string; url?: string }; error?: string };
      if (!res.ok) throw new Error(json.error ?? `BitPay ${res.status}`);
      const d = json.data;
      if (!d?.id) throw new Error("BitPay returned no invoice id");
      return { id: d.id, url: String(d.url), coin: params.coin, coinAmount: params.coinAmount };
    } finally {
      clearTimeout(timer);
    }
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string | undefined>): unknown {
    const sig = headers["x-bitpay-signature"];
    if (!sig) return null;
    const env = getEnv();
    const expected = createHmac("sha512", env.BITPAY_WEBHOOK_SECRET).update(payload).digest("hex");
    if (sig !== expected) return null;
    try {
      return JSON.parse(payload.toString());
    } catch {
      return null;
    }
  }

  eventKind(event: unknown): "paid" | "refunded" | "cancelled" | null {
    const status = (event as { data?: { status?: string } })?.data?.status ?? "";
    if (status === "paid" || status === "confirmed" || status === "complete") return "paid";
    if (status === "refunded") return "refunded";
    if (status === "expired" || status === "invalid") return "cancelled";
    return null;
  }

  orderIdOf(event: unknown): string | null {
    const orderId = (event as { data?: { orderId?: string } })?.data?.orderId;
    return typeof orderId === "string" && orderId ? orderId : null;
  }
}

export function getCryptoProvider(id?: string): CryptoProvider | null {
  const env = getEnv();
  const ids = cryptoProviderIds();
  const want = (id ?? "").toLowerCase();
  const chosen = ids.includes(want) ? want : ids[0];
  if (!chosen) return null;
  if (chosen === "btcpayserver") {
    return env.BTCPAY_URL && env.BTCPAY_API_KEY && env.BTCPAY_STORE_ID ? new BtcPayServerProvider() : null;
  }
  if (chosen === "bitpay") {
    return env.BITPAY_API_KEY ? new BitPayProvider() : null;
  }
  return null;
}

// Accepts an optional caller-selected coin. When given, the coin is validated
// against the configured allowlist and falls back to the first supported coin
// only if the caller supplied nothing invalid. This keeps the checkout quote
// (shown for the picked coin) in sync with the invoice that is actually created.
export async function createCryptoInvoice(params: {
  providerId?: string;
  plan: string;
  priceCents: number;
  currency: string;
  orderId: string;
  coin?: string;
}): Promise<{ provider: string; invoiceId: string; url: string; coin: string; coinAmount: string; rateUsd: number }> {
  const supported = supportedCoins();
  const coin = params.coin && supported.includes(params.coin.toUpperCase()) ? params.coin.toUpperCase() : (supported[0] ?? "BTC");
  const rateUsd = await coinUsdRate(coin);
  const coinAmount = quoteCoinAmount(params.priceCents, rateUsd);
  const provider = getCryptoProvider(params.providerId);
  if (!provider) throw new Error(`Crypto is not enabled (no ${params.providerId ?? "default"} provider configured)`);
  const invoice = await provider.createInvoice({
    priceCents: params.priceCents,
    currency: params.currency,
    coin,
    coinAmount,
    orderId: params.orderId,
  });
  return {
    provider: provider.id,
    invoiceId: invoice.id,
    url: invoice.url,
    coin,
    coinAmount,
    rateUsd,
  };
}

export { coinUsdRate, quoteCoinAmount };