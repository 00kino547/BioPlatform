import { randomUUID } from "crypto";
import { isIP } from "net";
import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "./prisma.js";

type Db = Prisma.TransactionClient | PrismaClient;

export const ABUSE_WHITELIST_SETTING_KEY = "abuse.whitelist";
export const MAX_WHITELIST_ENTRIES = 200;

export interface AbuseWhitelistEntry {
  id: string;
  value: string;
  note: string;
  createdAt: string;
  createdBy: string;
}

export interface AbuseWhitelistRule {
  family: 4 | 6;
  value: bigint;
  prefix: number;
}

const IPV4_MAPPED = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/;

function ipv4ToBigInt(ip: string): bigint {
  return ip.split(".").reduce((acc, octet) => (acc << 8n) | BigInt(Number(octet)), 0n);
}

function ipv6ToBigInt(ip: string): bigint {
  const parts = ip.toLowerCase().split("::");
  if (parts.length === 1) {
    return parts[0]
      .split(":")
      .reduce((acc, group) => (acc << 16n) | BigInt(parseInt(group || "0", 16)), 0n);
  }
  const head = parts[0] === "" ? [] : parts[0].split(":");
  const tail = parts[1] === "" ? [] : parts[1].split(":");
  const missing = 8 - head.length - tail.length;
  const groups = [...head, ...Array(Math.max(0, missing)).fill("0"), ...tail];
  return groups.reduce((acc, group) => (acc << 16n) | BigInt(parseInt(group || "0", 16)), 0n);
}

function ipToBigInt(ip: string): { family: 4 | 6; value: bigint } | null {
  const family = isIP(ip);
  if (family === 4) return { family: 4, value: ipv4ToBigInt(ip) };
  if (family === 6) {
    const mapped = IPV4_MAPPED.exec(ip.toLowerCase());
    if (mapped) return { family: 4, value: ipv4ToBigInt(mapped[1]) };
    return { family: 6, value: ipv6ToBigInt(ip) };
  }
  return null;
}

export function parseAbuseWhitelistRule(value: string): AbuseWhitelistRule | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const slash = trimmed.lastIndexOf("/");
  const ipPart = slash === -1 ? trimmed : trimmed.slice(0, slash);
  const rawPrefix = slash === -1 ? null : trimmed.slice(slash + 1);
  const parsed = ipToBigInt(ipPart);
  if (!parsed) return null;
  const maxBits = parsed.family === 4 ? 32 : 128;
  if (rawPrefix !== null && !/^\d{1,3}$/.test(rawPrefix)) return null;
  const prefix = rawPrefix === null ? maxBits : Number(rawPrefix);
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > maxBits) return null;
  return { family: parsed.family, value: parsed.value, prefix };
}

export function ipMatchesRule(rule: AbuseWhitelistRule, ip: string): boolean {
  const parsed = ipToBigInt(ip);
  if (!parsed || parsed.family !== rule.family) return false;
  const maxBits = rule.family === 4 ? 32 : 128;
  const shift = maxBits - rule.prefix;
  if (shift <= 0) return parsed.value === rule.value;
  return (parsed.value >> BigInt(shift)) === (rule.value >> BigInt(shift));
}

export async function loadAbuseWhitelist(db: Db = prisma): Promise<AbuseWhitelistEntry[]> {
  const row = await db.systemSetting.findUnique({ where: { key: ABUSE_WHITELIST_SETTING_KEY } });
  if (!row) return [];
  try {
    const parsed: unknown = JSON.parse(row.value);
    if (!Array.isArray(parsed)) return [];
    const entries: AbuseWhitelistEntry[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== "object") continue;
      const e = item as Record<string, unknown>;
      if (
        typeof e.id === "string" &&
        typeof e.value === "string" &&
        typeof e.note === "string" &&
        typeof e.createdAt === "string" &&
        typeof e.createdBy === "string"
      ) {
        entries.push({ id: e.id, value: e.value, note: e.note, createdAt: e.createdAt, createdBy: e.createdBy });
        if (entries.length >= MAX_WHITELIST_ENTRIES) break;
      }
    }
    return entries;
  } catch {
    return [];
  }
}

async function saveAbuseWhitelist(entries: AbuseWhitelistEntry[], db: Db): Promise<void> {
  const value = JSON.stringify(entries);
  await db.systemSetting.upsert({
    where: { key: ABUSE_WHITELIST_SETTING_KEY },
    update: { value },
    create: { key: ABUSE_WHITELIST_SETTING_KEY, value },
  });
}

export async function isIpAbuseWhitelisted(ip: string, db: Db = prisma): Promise<boolean> {
  if (!ip) return false;
  const rules = (await loadAbuseWhitelist(db))
    .map((e) => parseAbuseWhitelistRule(e.value))
    .filter((r): r is AbuseWhitelistRule => r !== null);
  return rules.some((r) => ipMatchesRule(r, ip));
}

export async function addAbuseWhitelistEntry(
  input: { value: string; note?: string; createdBy: string },
  db: Db = prisma
): Promise<AbuseWhitelistEntry> {
  const value = input.value.trim();
  if (!parseAbuseWhitelistRule(value)) {
    throw new Error("Must be a valid IP address or CIDR network (e.g. 1.2.3.4 or 1.2.3.0/24).");
  }
  const note = (input.note ?? "").replace(/[<>]/g, "").slice(0, 200).trim();
  const entries = await loadAbuseWhitelist(db);
  if (entries.some((e) => e.value.toLowerCase() === value.toLowerCase())) {
    throw new Error("That IP or network is already whitelisted.");
  }
  if (entries.length >= MAX_WHITELIST_ENTRIES) {
    throw new Error(`The whitelist is full (max ${MAX_WHITELIST_ENTRIES} entries).`);
  }
  const entry: AbuseWhitelistEntry = {
    id: randomUUID(),
    value,
    note,
    createdAt: new Date().toISOString(),
    createdBy: input.createdBy.slice(0, 100),
  };
  await saveAbuseWhitelist([...entries, entry], db);
  return entry;
}

export async function removeAbuseWhitelistEntry(id: string, db: Db = prisma): Promise<boolean> {
  const entries = await loadAbuseWhitelist(db);
  const next = entries.filter((e) => e.id !== id);
  if (next.length === entries.length) return false;
  await saveAbuseWhitelist(next, db);
  return true;
}