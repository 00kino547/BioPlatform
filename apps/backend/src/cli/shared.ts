import { createInterface } from "node:readline";
import { prisma } from "../lib/prisma.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ParsedArgs {
  positional: string[];
  flags: Record<string, string | boolean>;
}

export function parseArgs(argv: string[]): ParsedArgs {
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]!;
    if (token.startsWith("--")) {
      const body = token.slice(2);
      const eq = body.indexOf("=");
      if (eq >= 0) {
        flags[body.slice(0, eq)] = body.slice(eq + 1);
      } else {
        const next = argv[i + 1];
        if (next !== undefined && !next.startsWith("--")) {
          flags[body] = next;
          i++;
        } else {
          flags[body] = true;
        }
      }
    } else {
      positional.push(token);
    }
  }
  return { positional, flags };
}

export function flagString(flags: Record<string, string | boolean>, key: string): string | undefined {
  const v = flags[key];
  return typeof v === "string" ? v : undefined;
}

export function flagBool(flags: Record<string, string | boolean>, key: string): boolean {
  return flags[key] === true || flags[key] === "true";
}

export function die(message: string): never {
  console.error(`error: ${message}`);
  process.exit(1);
}

export function printJson(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

export async function confirm(question: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise<string>((resolve) => {
    rl.question(`${question} Type YES to confirm: `, (v) => resolve(v.trim()));
  });
  rl.close();
  return answer === "YES";
}

export function prompt(label: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(label, (v) => {
      rl.close();
      resolve(v);
    });
  });
}

export function promptHidden(label: string): Promise<string> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
  });
  (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = (s: string) => {
    if (!s.includes(label)) return;
    process.stdout.write(s.replace(/[^\n]/g, "*"));
  };
  return new Promise((resolve) => {
    rl.question(label, (v) => {
      process.stdout.write("\n");
      rl.close();
      resolve(v);
    });
  });
}

export const userSelect = {
  id: true,
  username: true,
  email: true,
  tier: true,
  trackLimit: true,
  profileLimit: true,
  aliasLimit: true,
  inviteAllowance: true,
  inviteBanned: true,
  totpEnabled: true,
  registeredIp: true,
  lastLoginIp: true,
  createdAt: true,
  updatedAt: true,
  role: { select: { id: true, slug: true, name: true, isSystem: true } },
  badges: { select: { id: true } },
} as const;

export async function findUserByIdentifier(identifier: string) {
  const raw = identifier.trim();
  const value = raw.startsWith("@") ? raw.slice(1) : raw;

  if (UUID_RE.test(value)) {
    return prisma.user.findUnique({ where: { id: value }, select: userSelect });
  }

  if (raw.includes("@") && !raw.startsWith("@")) {
    return prisma.user.findUnique({ where: { email: raw.toLowerCase() }, select: userSelect });
  }

  const byUsername = await prisma.user.findUnique({ where: { username: value.toLowerCase() }, select: userSelect });
  if (byUsername) return byUsername;

  const profile = await prisma.profile.findFirst({
    where: { OR: [{ slug: value }, { aliases: { some: { slug: value } } }] },
    select: { userId: true },
  });
  if (profile) {
    return prisma.user.findUnique({ where: { id: profile.userId }, select: userSelect });
  }

  return null;
}

export async function resolveUserId(identifier: string): Promise<string> {
  const user = await findUserByIdentifier(identifier);
  if (!user) die(`no user found for "${identifier}" (@username, email, slug, alias or UUID)`);
  return user.id;
}
