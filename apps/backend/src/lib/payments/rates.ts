import { getEnv } from "../../config/env.js";

const COINGECKO_SIMPLE_URL = "https://api.coingecko.com/api/v3/simple/price";
const COINGECKO_IDS: Record<string, string> = {
  BTC: "bitcoin",
  LTC: "litecoin",
  XMR: "monero",
  USDT: "tether",
  ETH: "ethereum",
};

const FETCH_TIMEOUT_MS = 8000;

let cache: { coin: string; usd: number; at: number } | null = null;

export function supportedCoins(): string[] {
  const env = getEnv();
  return env.CRYPTO_COINS.split(",")
    .map((c) => c.trim().toUpperCase())
    .filter((c) => COINGECKO_IDS[c]);
}

export function parseFallbackRates(raw: string): Record<string, number> {
  const out: Record<string, number> = {};
  if (!raw) return out;
  for (const part of raw.split(",")) {
    const [coin, price] = part.split("=").map((s) => s.trim());
    const rate = Number(price);
    if (coin && Number.isFinite(rate) && rate > 0) out[coin.toUpperCase()] = rate;
  }
  return out;
}

async function fetchLiveRate(coin: string): Promise<number | null> {
  const id = COINGECKO_IDS[coin];
  if (!id) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(
      `${COINGECKO_SIMPLE_URL}?ids=${encodeURIComponent(id)}&vs_currencies=usd`,
      { signal: controller.signal, headers: { accept: "application/json" } },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as Record<string, { usd?: number }>;
    const usd = data[id]?.usd;
    return typeof usd === "number" && usd > 0 ? usd : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function coinUsdRate(coin: string): Promise<number> {
  const env = getEnv();
  const upper = coin.toUpperCase();
  const ttlMs = env.CRYPTO_RATE_CACHE_SECONDS * 1000;
  if (cache && cache.coin === upper && Date.now() - cache.at < ttlMs) {
    return cache.usd;
  }
  const fallback = parseFallbackRates(env.CRYPTO_RATE_FALLBACK)[upper];
  let usd: number | null = null;
  if (env.CRYPTO_RATE_SOURCE === "coingecko") {
    usd = await fetchLiveRate(upper);
  }
  const rate = usd ?? fallback;
  if (!rate) {
    throw new Error(`No rate available for ${upper} (live fetch failed and no fallback configured)`);
  }
  cache = { coin: upper, usd: rate, at: Date.now() };
  return rate;
}

export function quoteCoinAmount(usdCents: number, rateUsd: number): string {
  if (usdCents <= 0) return "0";
  if (rateUsd <= 0) throw new Error("invalid rate");
  const usd = usdCents / 100;
  const amount = usd / rateUsd;
  return amount.toFixed(8);
}

export function clearRateCacheForTest(): void {
  cache = null;
}