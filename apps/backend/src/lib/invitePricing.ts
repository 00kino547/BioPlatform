import { getEnv } from "../config/env.js";

/**
 * Pricing for the paid-invite store.
 *
 * Kept in its own module so the checkout routes, the admin panel and the frontend
 * config endpoint all derive the same packs from one parser. There is no second
 * implementation of this logic anywhere.
 */

/** Upper bound on credits per order. Mirrors the invite generation batch cap. */
export const MAX_PACK_QUANTITY = 50;

/** A single purchasable bundle. Quantities are discrete, not computed on the fly. */
export interface InvitePack {
  /** How many invite credits the buyer receives. */
  quantity: number;
  /** What the bundle costs, in the billing currency's minor unit. */
  priceCents: number;
  /**
   * Per-credit price, for display and for marking the best-value pack. Derived,
   * never authoritative: the buyer still pays `priceCents`.
   */
  unitCents: number;
  /** Lowest per-credit price among the configured packs. */
  bestValue: boolean;
}

/**
 * Parses `INVITE_PRICE_PACKS` (`"1:100,3:200,10:600"`) into packs.
 *
 * Invalid entries are skipped rather than throwing, so one typo cannot take an
 * instance's whole checkout down; the operator sees the pack simply disappear.
 * Duplicate quantities keep the cheapest price, and the result is sorted by
 * quantity ascending so the frontend can render them in order.
 */
export function parseInvitePacks(raw: string): InvitePack[] {
  const byQuantity = new Map<number, number>();

  for (const entry of raw.split(",")) {
    const trimmed = entry.trim();
    if (!trimmed) continue;

    const [qtyRaw, priceRaw, ...rest] = trimmed.split(":");
    // Reject anything with extra fields so a malformed pair cannot be silently
    // reinterpreted as a valid one.
    if (rest.length > 0) continue;

    const quantity = Number(qtyRaw);
    const priceCents = Number(priceRaw);

    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_PACK_QUANTITY) continue;
    // A zero or negative price would let a buyer mint credits for free, so the
    // floor is 1 minor unit rather than 0.
    if (!Number.isInteger(priceCents) || priceCents < 1) continue;

    const existing = byQuantity.get(quantity);
    if (existing === undefined || priceCents < existing) byQuantity.set(quantity, priceCents);
  }

  const sorted = [...byQuantity.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([quantity, priceCents]) => ({ quantity, priceCents }));

  const cheapestUnit = sorted.length
    ? Math.min(...sorted.map((p) => p.priceCents / p.quantity))
    : 0;

  return sorted.map(({ quantity, priceCents }) => {
    // Rounded up: displaying a per-credit price lower than what is actually
    // charged would overstate the discount.
    const unitCents = Math.ceil(priceCents / quantity);
    return {
      quantity,
      priceCents,
      unitCents,
      bestValue: sorted.length > 1 && priceCents / quantity === cheapestUnit,
    };
  });
}

/**
 * The public pack list, or an empty list when paid invites are not configured.
 *
 * Emptiness here is the hard off switch: the admin toggle can only *hide* a
 * store that has packs, never conjure one, so an instance that never set
 * `INVITE_PRICE_PACKS` cannot sell a credit even if the toggle is flipped.
 */
export function invitePackConfig(): { currency: string; packs: InvitePack[] } {
  const env = getEnv();
  return { currency: env.BILLING_CURRENCY, packs: parseInvitePacks(env.INVITE_PRICE_PACKS) };
}

/** True when at least one pack is configured. */
export function invitePacksConfigured(): boolean {
  return invitePackConfig().packs.length > 0;
}

/**
 * Resolves the price for an exact pack quantity, or null when that quantity is
 * not offered. Deliberately exact: a volume discount is expressed by a pack, so
 * silently pricing an arbitrary quantity at the cheapest unit rate would quietly
 * hand out bulk discounts nobody configured.
 */
export function priceForPackQuantity(packs: InvitePack[], quantity: number): InvitePack | null {
  return packs.find((p) => p.quantity === quantity) ?? null;
}