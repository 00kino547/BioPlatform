import { z } from "zod";
import { getCryptoProvider } from "./payments/crypto.js";

export const TIP_COINS = ["BTC", "LTC"] as const;
export type TipCoin = (typeof TIP_COINS)[number];

export const tipAmountSchema = z
  .string()
  .regex(/^\d+(\.\d{1,8})?$/, { message: "Amount must be a positive number with up to 8 decimal places" })
  .refine(
    (v) => { const n = Number(v); return n > 0 && n <= 100_000_000; },
    { message: "Amount must be between 0.00000001 and 100000000" },
  );

export function tipUri(coin: string, address: string, amount: string): string {
  if (coin === "LTC") return `litecoin:${address}?amount=${amount}`;
  return `bitcoin:${address}?amount=${amount}`;
}

export function tipsPaymentMode(): "btcpay" | "address" {
  return getCryptoProvider("btcpayserver") ? "btcpay" : "address";
}
