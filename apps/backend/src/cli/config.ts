// `bioplatform config validate|reload` — config.yml operations for the instance
// operator.
//
// The CLI runs in a SEPARATE process from the server, so `reload` cannot call
// into the server directly. Instead the server polls the config file's mtime
// and a zero-byte sentinel (`config.yml.reload`) a few times a second; the CLI
// validates the file first, then bumps the mtime AND touches/sentinel-touches
// the sentinel so the running server picks the new file up on its next poll —
// whether or not CONFIG_AUTO_RELOAD is on. Nothing in this command ever needs
// the database, so it works even while the backend is fully down (validate is a
// pure offline check; reload happily "requests" a change the next server boot
// will also read).
//
// SECURITY: validate/reload must never print the parsed config. `private` is
// exactly the section this CLI must not leak to stdout/logs.

import { existsSync } from "node:fs";
import { utimesSync, writeFileSync } from "node:fs";
import { die, printJson, parseArgs, flagBool } from "./shared.js";
import {
  parseInstanceConfig,
  resolveConfigPath,
  reloadSentinelPath,
} from "../lib/instanceConfig.js";

const CONFIG_HELP = `bioplatform config <validate|reload> [<path>] [--json]

Manage the human-editable instance configuration (config.yml).

  validate [<path>]   Parse + validate the file offline. Exits 0 when the file
                      is valid (or absent -> schema defaults), 1 when it is
                      broken, printing the exact schema errors. --json prints a
                      machine-readable {valid,source,errors} object.
  reload  [<path>]   Validate first, then signal the RUNNING server to re-read
                      it (bumps config.yml's mtime and touches config.yml.reload).
                      Exit 0 = change requested; 1 = invalid file, nothing done.

<path> defaults to CONFIG_FILE env (config.yml). Relative paths resolve against
the backend working directory. The file (and its mount) must be writable so the
reload signal can be sent.`;

export interface ConfigOutcome {
  command: "validate" | "reload";
  path: string;
  valid: boolean;
  source?: "file" | "absent";
  requested?: boolean;
  errors?: string[];
}

function printOutcome(outcome: ConfigOutcome, json: boolean): void {
  if (json) {
    printJson(outcome);
    return;
  }
  if (outcome.command === "validate") {
    if (outcome.valid) {
      if (outcome.source === "absent") {
        console.log(`config: no file at ${outcome.path} — validating schema defaults (ok)`);
      } else {
        console.log(`config: ${outcome.path} is valid`);
      }
    } else {
      console.error(`config: ${outcome.path} is INVALID`);
      for (const error of outcome.errors ?? []) {
        console.error(`  - ${error}`);
      }
      process.exitCode = 1;
    }
  } else if (outcome.valid) {
    console.log(`config: reload requested for ${outcome.path} — server applies on next poll`);
  } else {
    console.error(`config: reload NOT requested — ${outcome.path} is invalid`);
    for (const error of outcome.errors ?? []) {
      console.error(`  - ${error}`);
    }
    process.exitCode = 1;
  }
}

export function runConfig(argv: string[]): void {
  // No subcommand or a help flag shows the sub-command usage. When invoked via
  // the app-level help the user may print `config` with nothing else.
  if (argv.length === 0 || argv[0] === "help" || argv[0] === "--help" || argv[0] === "-h") {
    console.log(CONFIG_HELP);
    return;
  }

  const sub = argv[0];
  const { positional, flags } = parseArgs(argv.slice(1));
  const json = flagBool(flags, "json");
  // Optional explicit path, or CONFIG_FILE, or the default.
  const path = positional[0] ?? resolveConfigPath();

  if (sub !== "validate" && sub !== "reload") {
    die(`unknown config subcommand "${sub}" (expected validate or reload)`);
  }

  const result = parseInstanceConfig(path);

  // validate is a pure offline read — print the outcome and stop.
  if (sub === "validate") {
    printOutcome(
      {
        command: "validate",
        path,
        valid: result.ok,
        source: result.ok ? result.source : undefined,
        errors: result.ok ? undefined : [result.error],
      },
      json
    );
    return;
  }

  // reload: never signal a broken file (the server would reject it anyway).
  if (!result.ok) {
    printOutcome(
      {
        command: "reload",
        path,
        valid: false,
        errors: [result.error],
      },
      json
    );
    return;
  }

  // Configuration is valid. Request the running server (or next boot) to apply
  // it: bump config.yml's mtime and touch the sentinel. Both are required —
  // mtime covers CONFIG_AUTO_RELOAD=true watchers, the sentinel covers
  // auto-reload-off watchers that only watch for explicit requests.
  if (!existsSync(path)) {
    die(`cannot request reload: ${path} does not exist (nothing to signal)`);
  }
  const now = new Date();
  utimesSync(path, now, now);
  writeFileSync(reloadSentinelPath(path), "", { flag: "a" });
  utimesSync(reloadSentinelPath(path), now, now);

  printOutcome(
    {
      command: "reload",
      path,
      valid: true,
      source: result.source,
      requested: true,
    },
    json
  );
}