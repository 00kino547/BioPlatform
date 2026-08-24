import { createRequire } from "node:module";
import { prisma } from "../lib/prisma.js";
import { die, printJson, parseArgs, flagBool } from "./shared.js";
import { runUsers } from "./users.js";
import { runProfiles } from "./profiles.js";

const require = createRequire(import.meta.url);
const { version } = require("../../package.json") as { version: string };

const HELP = `bioplatform ${version} — instance administration CLI

Runs inside the backend container with direct database access. Intended for
self-hosters: it can administer ANY account, including your own, where the
web admin panel deliberately blocks self-editing.

usage:
  bioplatform <command> <subcommand> [args] [flags]

commands:
  users list [--tier FREE|PRO|ENTERPRISE] [--json]
  users show <@username|user@example.com|slug|alias|uuid>
  users set-tier <identifier> <FREE|PRO|ENTERPRISE>
  users set-limits <identifier> [--tracks N|none] [--profiles N|none] [--aliases N|none]
  users set-username <identifier> <newUsername>          (syncs primary profile slug)
  users set-email <identifier> <newEmail>
  users reset-password <identifier> [--password <pw>]    (asks confirmation; bcrypt 12)
  users unlock <identifier>                              (clears account + fingerprint bans)
  users ban-invites <identifier> | unban-invites <identifier>
  users delete <identifier> [--yes]                      (typed YES required unless --yes)

  profiles list <identifier>
  profiles show <identifier> [--profile-id <uuid>]
  profiles edit <identifier> [--profile-id <uuid>] [--display-name X|none]
      [--bio X|none] [--location X|none] [--website <url>|none]
      [--public] [--private]

identifier: @username, user@example.com, profile slug/alias or UUID.
"none" clears an optional field. --json prints raw JSON.

examples:
  bioplatform users set-tier @admin ENTERPRISE
  bioplatform users reset-password admin@example.com
  bioplatform profiles edit @admin --display-name "Kino" --bio "hello world"
  bioplatform users delete oldaccount --yes`;

function main(): void {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv[0] === "help" || argv[0] === "--help" || argv[0] === "-h") {
    console.log(HELP);
    return;
  }
  if (argv[0] === "--version" || argv[0] === "version") {
    printJson({ version });
    return;
  }

  const command = argv[0];
  if (command === "users") {
    runUsers(argv.slice(1))
      .then(finish)
      .catch(fail);
    return;
  }
  if (command === "profiles") {
    runProfiles(argv.slice(1))
      .then(finish)
      .catch(fail);
    return;
  }
  const parsed = parseArgs(argv);
  if (flagBool(parsed.flags, "json")) die(`unknown command "${String(command)}"`);
  die(`unknown command "${String(command)}" — run "bioplatform help"`);
}

function finish(): void {
  void prisma.$disconnect();
}

function fail(err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`error: ${message}`);
  void prisma.$disconnect();
  process.exit(1);
}

main();
