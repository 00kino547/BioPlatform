import bcrypt from "bcrypt";
import fs from "fs";
import path from "path";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { dispatchWebhookEventAsync } from "../lib/webhook.js";
import { getEnv } from "../config/env.js";
import {
  confirm,
  die,
  flagBool,
  flagString,
  findUserByIdentifier,
  parseArgs,
  printJson,
  promptHidden,
  resolveUserId,
  userSelect,
} from "./shared.js";

type UserRow = {
  id: string;
  username: string;
  email: string;
  tier: string;
  trackLimit: number | null;
  profileLimit: number | null;
  aliasLimit: number | null;
  inviteAllowance: number;
  inviteBanned: boolean;
  totpEnabled: boolean;
  registeredIp: string | null;
  lastLoginIp: string | null;
  createdAt: Date;
  updatedAt: Date;
  role: { id: string; slug: string; name: string; isSystem: boolean } | null;
  badges: { id: string }[];
};

const LIMIT_KEYS = ["trackLimit", "profileLimit", "aliasLimit"] as const;

function limitFlagToValue(raw: string): number | null {
  if (raw.toLowerCase() === "none") return null;
  const n = Number.parseInt(raw, 10);
  if (!Number.isInteger(n) || n < 0 || n > 100) {
    die(`limit must be an integer 0-100 or "none" (got "${raw}")`);
  }
  return n;
}

function printUserLine(u: UserRow): void {
  const limits = `${u.trackLimit ?? "-"}|${u.profileLimit ?? "-"}|${u.aliasLimit ?? "-"}`;
  console.log(
    [
      u.id.slice(0, 8),
      u.username.padEnd(20),
      u.email.padEnd(30),
      u.tier.padEnd(11),
      limits.padEnd(12),
      (u.role?.name ?? "-").padEnd(16),
      String(u.badges.length).padEnd(7),
      u.inviteBanned ? "inviteBanned" : "",
    ].join(" ")
  );
}

export async function runUsers(argv: string[]): Promise<void> {
  const [subcommand] = argv;
  if (!subcommand || subcommand === "help") die("usage: bioplatform users <list|show|set-tier|set-limits|set-username|set-email|reset-password|unlock|ban-invites|unban-invites|delete> ...");

  switch (subcommand) {
    case "list":
      return usersList(parseArgs(argv.slice(1)));
    case "show":
      return usersShow(argv[1]);
    case "set-tier":
      return usersSetTier(argv[1], argv[2]);
    case "set-limits":
      return usersSetLimits(argv[1], argv.slice(2));
    case "set-username":
      return usersSetUsername(argv[1], argv[2]);
    case "set-email":
      return usersSetEmail(argv[1], argv[2]);
    case "reset-password":
      return usersResetPassword(argv[1], argv.slice(2));
    case "unlock":
      return usersUnlock(argv[1]);
    case "ban-invites":
      return usersInviteBan(argv[1], true);
    case "unban-invites":
      return usersInviteBan(argv[1], false);
    case "delete":
      return usersDelete(argv[1], parseArgs(argv.slice(2)));
    default:
      die(`unknown users subcommand "${String(subcommand)}"`);
  }
}

async function usersList(args: ReturnType<typeof parseArgs>): Promise<void> {
  const tier = flagString(args.flags, "tier");
  const where = tier ? { tier: tier.toUpperCase() as "FREE" | "PRO" | "ENTERPRISE" } : {};
  if (tier && !["FREE", "PRO", "ENTERPRISE"].includes(tier.toUpperCase())) {
    die("--tier must be FREE, PRO or ENTERPRISE");
  }
  const users = await prisma.user.findMany({ where, orderBy: { createdAt: "asc" }, select: userSelect });
  if (flagBool(args.flags, "json")) {
    printJson(users);
    return;
  }
  console.log(
    `${"id".padEnd(9)}${"username".padEnd(21)}${"email".padEnd(31)}${"tier".padEnd(12)}${"T|P|A".padEnd(13)}${"role".padEnd(17)}badges`
  );
  for (const u of users) printUserLine(u);
  console.log(`\n${users.length} user(s)`);
}

async function usersShow(identifier?: string): Promise<void> {
  if (!identifier) die("usage: bioplatform users show <@username|email|slug|uuid>");
  const user = await findUserByIdentifier(identifier);
  if (!user) die(`no user found for "${identifier}"`);
  const row = user as UserRow;
  const profiles = await prisma.profile.findMany({
    where: { userId: row.id },
    select: { id: true, slug: true, isPrimary: true, isPublic: true },
    orderBy: [{ isPrimary: "desc" }, { slug: "asc" }],
  });
  printJson({
    ...row,
    profiles,
  });
}

async function usersSetTier(identifier?: string, tier?: string): Promise<void> {
  if (!identifier || !tier) die("usage: bioplatform users set-tier <identifier> <FREE|PRO|ENTERPRISE>");
  const value = tier.toUpperCase();
  if (!["FREE", "PRO", "ENTERPRISE"].includes(value)) die("tier must be FREE, PRO or ENTERPRISE");
  const id = await resolveUserId(identifier);
  const updated = await prisma.user.update({
    where: { id },
    data: { tier: value as "FREE" | "PRO" | "ENTERPRISE" },
    select: userSelect,
  });
  console.log(`ok: ${updated.username} tier -> ${value}`);
}

async function usersSetLimits(identifier?: string, rest?: string[]): Promise<void> {
  if (!identifier) die("usage: bioplatform users set-limits <identifier> [--tracks N|none] [--profiles N|none] [--aliases N|none]");
  const args = parseArgs(rest ?? []);
  const data: Record<string, number | null> = {};
  for (const [flag, key] of [
    ["tracks", "trackLimit"],
    ["profiles", "profileLimit"],
    ["aliases", "aliasLimit"],
  ] as const) {
    const raw = flagString(args.flags, flag);
    if (raw !== undefined) data[key] = limitFlagToValue(raw);
  }
  if (LIMIT_KEYS.every((k) => !(k in data))) die("nothing to do: pass --tracks/--profiles/--aliases");
  const id = await resolveUserId(identifier);
  const updated = await prisma.user.update({ where: { id }, data, select: userSelect });
  printJson({ username: updated.username, trackLimit: updated.trackLimit, profileLimit: updated.profileLimit, aliasLimit: updated.aliasLimit });
}

async function usersSetUsername(identifier?: string, next?: string): Promise<void> {
  if (!identifier || !next) die("usage: bioplatform users set-username <identifier> <newUsername>");
  const parsed = z.string().min(3).max(32).regex(/^[a-z0-9_-]+$/).safeParse(next);
  if (!parsed.success) die("username must be 3-32 chars, lowercase letters/numbers/dashes/underscores");
  const existing = await findUserByIdentifier(identifier);
  if (!existing) die(`no user found for "${identifier}"`);
  const row = existing as UserRow;
  if (next !== row.username) {
    const takenUser = await prisma.user.findUnique({ where: { username: next } });
    if (takenUser) die("username already taken");
    const takenSlug = await prisma.profile.findUnique({ where: { slug: next } });
    if (takenSlug) die("username already used as a profile URL");
  }
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: row.id }, data: { username: next } });
    await tx.profile.updateMany({ where: { userId: row.id, isPrimary: true }, data: { slug: next } });
  });
  console.log(`ok: username -> ${next} (primary profile slug synced)`);
}

async function usersSetEmail(identifier?: string, next?: string): Promise<void> {
  if (!identifier || !next) die("usage: bioplatform users set-email <identifier> <newEmail>");
  const email = next.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) die("invalid email address");
  const id = await resolveUserId(identifier);
  const clash = await prisma.user.findUnique({ where: { email } });
  if (clash && clash.id !== id) die("email already taken");
  await prisma.user.update({ where: { id }, data: { email } });
  console.log(`ok: email -> ${email}`);
}

async function usersResetPassword(identifier?: string, rest?: string[]): Promise<void> {
  if (!identifier) die("usage: bioplatform users reset-password <identifier> [--password <newPassword>] [--yes]");
  const args = parseArgs(rest ?? []);
  const provided = flagString(args.flags, "password");

  let newPassword: string;
  if (provided !== undefined) {
    newPassword = provided;
  } else {
    const first = await promptHidden("new password: ");
    const second = await promptHidden("confirm password: ");
    if (first !== second) die("passwords do not match");
    newPassword = first;
  }

  const check = z.string().min(8).max(128).safeParse(newPassword);
  if (!check.success) die("password must be 8-128 characters");

  const id = await resolveUserId(identifier);
  const target = await prisma.user.findUnique({ where: { id }, select: { username: true, email: true } });
  if (!target) die("user not found");

  console.log(`this overwrites the password for ${target.username} <${target.email}>`);
  if (!(await confirm("credential change"))) {
    console.log("aborted");
    process.exit(0);
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({ where: { id }, data: { passwordHash } });
  console.log("ok: password updated (bcrypt, 12 rounds)");
}

async function usersUnlock(identifier?: string): Promise<void> {
  if (!identifier) die("usage: bioplatform users unlock <identifier>");
  const id = await resolveUserId(identifier);
  const user = await prisma.user.findUnique({ where: { id }, select: { id: true, username: true } });
  if (!user) die("user not found");

  const logs = await prisma.authLog.findMany({ where: { accountId: user.id }, select: { ip: true, fingerprint: true } });
  const ips = [...new Set(logs.map((l) => l.ip).filter((v): v is string => Boolean(v)))];
  const cookies = [...new Set(logs.map((l) => l.fingerprint).filter((v): v is string => Boolean(v)))];

  const [accountBan, ipBans, cookieBans, failedLogs] = await Promise.all([
    prisma.authBan.deleteMany({ where: { kind: "ACCOUNT", value: user.id } }),
    prisma.authBan.deleteMany({ where: { kind: "IP", value: { in: ips } } }),
    prisma.authBan.deleteMany({ where: { kind: "COOKIE", value: { in: cookies } } }),
    prisma.authLog.deleteMany({ where: { accountId: user.id } }),
  ]);

  printJson({
    username: user.username,
    removed: {
      accountBans: accountBan.count,
      ipBans: ipBans.count,
      cookieBans: cookieBans.count,
      failedLogs: failedLogs.count,
    },
  });
}

async function usersInviteBan(identifier: string | undefined, banned: boolean): Promise<void> {
  if (!identifier) die(`usage: bioplatform users ${banned ? "ban-invites" : "unban-invites"} <identifier>`);
  const id = await resolveUserId(identifier);
  const data: Record<string, unknown> =
    banned === true
      ? { inviteBanned: true, inviteBannedAt: new Date(), inviteAllowance: 0 }
      : { inviteBanned: false, inviteBannedAt: null };
  await prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({ where: { id }, data, select: { username: true } });
    if (banned === true) {
      await tx.inviteCode.updateMany({
        where: { createdById: id, usedAt: null, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    return updated;
  });
  console.log(`ok: invites ${banned ? "banned" : "unbanned"} for ${identifier}`);
}

async function usersDelete(identifier: string | undefined, args: ReturnType<typeof parseArgs>): Promise<void> {
  if (!identifier) die("usage: bioplatform users delete <identifier> [--yes]");
  const user = await findUserByIdentifier(identifier);
  if (!user) die(`no user found for "${identifier}"`);
  const row = user as UserRow;

  console.log(`deleting ${row.username} <${row.email}> (${row.id})`);
  if (!flagBool(args.flags, "yes") && !(await confirm("this permanently removes the account and its files"))) {
    console.log("aborted");
    process.exit(0);
  }

  await dispatchWebhookEventAsync(row.id, "user.deleted", {
    username: row.username,
    deletedAt: new Date().toISOString(),
  });

  const full = await prisma.user.findUnique({
    where: { id: row.id },
    select: {
      username: true,
      profiles: {
        select: {
          avatar: true,
          banner: true,
          musicTracks: { select: { filePath: true } },
        },
      },
    },
  });
  if (!full) die("user vanished before deletion");

  await prisma.$transaction([
    prisma.authBan.deleteMany({ where: { kind: "ACCOUNT", value: row.id } }),
    prisma.authLog.deleteMany({ where: { OR: [{ accountId: row.id }, { username: full.username }] } }),
    prisma.inviteCode.deleteMany({ where: { createdById: row.id } }),
    prisma.user.delete({ where: { id: row.id } }),
  ]);

  const storageDir = getEnv().LOCAL_STORAGE_PATH;
  for (const profile of full.profiles) {
    for (const filePath of [profile.avatar, profile.banner]) {
      if (filePath) {
        const abs = path.resolve(storageDir, path.basename(filePath));
        if (fs.existsSync(abs)) fs.unlinkSync(abs);
      }
    }
    for (const track of profile.musicTracks) {
      if (track.filePath) {
        const abs = path.resolve(storageDir, path.basename(track.filePath));
        if (fs.existsSync(abs)) fs.unlinkSync(abs);
      }
    }
  }

  console.log("ok: user deleted (webhooks dispatched, uploads cleaned)");
}
