import { prisma } from "./prisma.js";
import { stripHtml } from "./validation.js";

/**
 * How a buyer reaches the operator to pay for something by hand.
 *
 * One setting serves every "pay by hand" path on the instance — the plan orders
 * in `routes/orders.ts` and the paid invite store in `routes/invitePurchase.ts` —
 * so an operator writes their payment instructions once and buyers are told the
 * same thing whichever checkout they used. It lives in its own module rather than
 * inside a route file so neither route has to import the other.
 */
export const CONTACT_SETTING_METHOD = "orders.contactMethod";
export const CONTACT_SETTING_VALUE = "orders.contactValue";
export const CONTACT_METHODS = ["email", "telegram", "discord", "whatsapp", "none"] as const;
export type ContactMethod = (typeof CONTACT_METHODS)[number];

export interface ContactConfig {
  method: string;
  value: string;
}

/** The stored instructions, exactly as saved. */
export async function getContactConfig(): Promise<ContactConfig> {
  const rows = await prisma.systemSetting.findMany({
    where: { key: { in: [CONTACT_SETTING_METHOD, CONTACT_SETTING_VALUE] } },
  });
  const method = rows.find((r) => r.key === CONTACT_SETTING_METHOD)?.value ?? "none";
  const value = rows.find((r) => r.key === CONTACT_SETTING_VALUE)?.value ?? "";
  return { method, value };
}

/**
 * The instructions as a buyer should see them.
 *
 * `configured` is deliberately separate from `method`: a method chosen with an
 * empty value (or an unknown one, from a row edited outside the admin UI) leaves
 * the buyer with no way to pay, so callers must be able to tell "no instructions
 * published" apart from "instructions published" without re-deriving the rule.
 */
export async function getManualPaymentInstructions(): Promise<{
  method: string;
  value: string;
  configured: boolean;
}> {
  const { method, value } = await getContactConfig();
  const known = (CONTACT_METHODS as readonly string[]).includes(method) && method !== "none";
  return { method, value, configured: known && value.trim().length > 0 };
}

export async function setContactConfig(method: string, value: string): Promise<void> {
  const cleanMethod = (CONTACT_METHODS as readonly string[]).includes(method) ? method : "none";
  const cleanValue = stripHtml(value).trim().slice(0, 300);
  for (const [key, val] of [
    [CONTACT_SETTING_METHOD, cleanMethod],
    [CONTACT_SETTING_VALUE, cleanMethod === "none" ? "" : cleanValue],
  ] as const) {
    await prisma.systemSetting.upsert({
      where: { key: key },
      update: { value: val },
      create: { key: key, value: val },
    });
  }
}