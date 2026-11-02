import { formatDateTime } from "@/lib/intl";
import type { TFunction } from "i18next";

export interface TerminalLink {
  platform: string;
  url: string;
}

export interface TerminalContext {
  username: string;
  displayName: string | null;
  bio: string | null;
  website: string | null;
  brand: string;
  host: string;
  links: TerminalLink[];
  terminalCommands?: TerminalCommand[];
}

export interface TerminalCommand {
  command: string;
  output: string;
  description?: string;
  url?: string;
}

export interface TerminalLine {
  text: string;
  kind?: "accent" | "dim";
  url?: string;
}

export interface TerminalResult {
  output: TerminalLine[];
  open?: { url: string; copy: boolean };
  clear?: boolean;
  matrixRain?: boolean;
}

// Terminal shell text is produced through the i18n `t` function so the whole
// command surface can be translated. Constants cannot call the `t` hook, so
// these helpers receive `t` from the calling component instead.
export function getHintText(t: TFunction): string {
  return t("interactiveTerminal.hint");
}

export function getHelpText(t: TFunction): TerminalLine[] {
  return [
    { text: t("interactiveTerminal.helpHelp"), kind: "dim" },
    { text: t("interactiveTerminal.helpWhoami"), kind: "dim" },
    { text: t("interactiveTerminal.helpLs"), kind: "dim" },
    { text: t("interactiveTerminal.helpCat"), kind: "dim" },
    { text: t("interactiveTerminal.helpOpen"), kind: "dim" },
    { text: t("interactiveTerminal.helpDate"), kind: "dim" },
    { text: t("interactiveTerminal.helpEcho"), kind: "dim" },
    { text: t("interactiveTerminal.helpClear"), kind: "dim" },
  ];
}

function prompt(text: string): TerminalLine {
  return { text, kind: "accent" };
}

function printableLinks(ctx: TerminalContext)
  : { name: string; url: string }[] {
  const out: { name: string; url: string }[] = [];
  if (ctx.website) out.push({ name: "website", url: ctx.website });
  for (const link of ctx.links) {
    out.push({ name: link.platform, url: link.url });
  }
  return out;
}

function findLinks(ctx: TerminalContext, token: string): { name: string; url: string }[] {
  const needle = token.toLowerCase();
  const all = printableLinks(ctx);
  const exact = all.filter((l) => l.name.toLowerCase() === needle);
  if (exact.length > 0) return exact;
  return all.filter((l) => l.name.toLowerCase().includes(needle));
}

const FACE_ART = [
  "        .--.",
  "       |o_o |",
  "       |:_/ |",
  "      //   \\ \\",
  "     (|     | )",
  "    /'\\_   _/`\\",
  "    \\___)=(___/",
];

const TRAIN_ART = [
  "       (o)           (o)           (o)",
  "       |_|           |_|           |_|",
  "   ____________  ____________  ____________",
  "\\  | [__][__] |  | [__][__] |  | [__][__] |",
  " \\ |__________|  |__________|  |__________|",
  "  \\|__|__|__|__| |__|__|__|__| |__|__|__|__|",
  "   \\  o  o  o    o  o  o  o    o  o  o  o",
];

export function runCommand(raw: string, ctx: TerminalContext, t: TFunction): TerminalResult {
  const trimmed = raw.trim();
  if (!trimmed) return { output: [] };

  const parts = trimmed.split(/\s+/);
  const cmd = parts[0].toLowerCase();
  const args = parts.slice(1);
  const rest = args.join(" ");

  switch (cmd) {
    case "help":
      return {
        output: [
          { text: t("interactiveTerminal.helpTitle"), kind: "dim" },
          ...getHelpText(t),
          ...(ctx.terminalCommands && ctx.terminalCommands.length > 0
            ? [
                { text: "", kind: "dim" } as TerminalLine,
                { text: t("interactiveTerminal.helpCustomTitle"), kind: "dim" } as TerminalLine,
                ...ctx.terminalCommands.map((c): TerminalLine => ({
                  text: `${c.command.padEnd(20)} ${(c.description || c.output.split("\n")[0]).slice(0, 40)}`,
                  kind: "dim",
                })),
              ]
            : []),
        ],
      };

    case "whoami":
      return {
        output: [
          prompt(
            t("interactiveTerminal.whoami", {
              name: ctx.displayName ?? ctx.username,
              username: ctx.username,
            }),
          ),
        ],
      };

    case "ls": {
      const target = args[0]?.toLowerCase().replace(/\/+$/, "") || undefined;
      const files: TerminalLine = { text: t("interactiveTerminal.lsFiles"), kind: "dim" };
      const linksRow: TerminalLine = {
        text: t("interactiveTerminal.lsLinksRow", {
          names: printableLinks(ctx).map((l) => l.name).join("  "),
        }),
        kind: "dim",
      };
      const cmdsRow: TerminalLine = {
        text: t("interactiveTerminal.lsCmdsRow", {
          cmds: ctx.terminalCommands?.map((c) => c.command).join("  ") ?? "",
        }),
        kind: "dim",
      };
      if (!target || ["-a", "-l", "-la", "-al"].includes(target)) {
        const output: TerminalLine[] = [files, linksRow];
        if (ctx.terminalCommands?.length) output.push(cmdsRow);
        return { output };
      }
      if (target === "links") return { output: [linksRow] };
      if (target === "cmds") {
        if (!ctx.terminalCommands?.length) {
          return { output: [{ text: t("interactiveTerminal.lsNoSuchFile", { path: args[0] }), kind: "dim" }] };
        }
        return { output: [cmdsRow] };
      }
      if (target === "whoami.txt" || target === "bio.txt") return { output: [files] };
      return { output: [{ text: t("interactiveTerminal.lsNoSuchFile", { path: args[0] }), kind: "dim" }] };
    }

    case "cat": {
      const file = args[0]?.toLowerCase();
      if (!file) return { output: [{ text: t("interactiveTerminal.catMissingOperand"), kind: "dim" }] };
      if (file === "whoami.txt") {
        return {
          output: [
            prompt(`${ctx.displayName ?? ctx.username}`),
            { text: t("interactiveTerminal.whoamiHandle", { username: ctx.username }), kind: "dim" },
          ],
        };
      }
      if (file === "bio.txt") {
        if (!ctx.bio) return { output: [{ text: t("interactiveTerminal.catEmptyBio"), kind: "dim" }] };
        return { output: [{ text: ctx.bio }] };
      }
      return { output: [{ text: t("interactiveTerminal.catNoSuchFile", { path: args[0] }), kind: "dim" }] };
    }

    case "open": {
      const needle = args[0];
      if (!needle) return { output: [{ text: t("interactiveTerminal.openUsage"), kind: "dim" }] };
      const matches = findLinks(ctx, needle);
      if (matches.length === 0) {
        return { output: [{ text: t("interactiveTerminal.openNoSuchLink", { needle }), kind: "dim" }] };
      }
      if (matches.length > 1 && args.length < 2) {
        return {
          output: [
            { text: t("interactiveTerminal.openMultipleFound", { num: matches.length, needle }), kind: "dim" },
            ...matches.map(
              (m, i) =>
                ({
                  text: t("interactiveTerminal.openMultipleItem", { index: i, name: m.name, url: m.url }),
                  kind: "dim",
                }) as TerminalLine,
            ),
            { text: t("interactiveTerminal.openPickOne", { needle }), kind: "dim" },
          ],
        };
      }
      let link = matches[0];
      if (matches.length > 1) {
        const idx = Number(args[1]);
        if (!Number.isInteger(idx) || idx < 0 || idx >= matches.length) {
          return {
            output: [
              {
                text: t("interactiveTerminal.openInvalidIndex", {
                  needle,
                  value: args[1],
                  max: matches.length - 1,
                }),
                kind: "dim",
              },
            ],
          };
        }
        link = matches[idx];
      }
      const copy = !/^(https?:|mailto:)/i.test(link.url);
      const output: TerminalLine[] = [
        copy
          ? { text: t("interactiveTerminal.openCopied", { name: link.name }), kind: "dim" }
          : { text: t("interactiveTerminal.openOpening", { name: link.name }), kind: "dim" },
      ];
      if (!copy) output.push({ text: link.url, url: link.url });
      return { output, open: { url: link.url, copy } };
    }

    case "date":
      return { output: [{ text: formatDateTime(new Date()) }] };

    case "echo":
      return rest ? { output: [{ text: rest }] } : { output: [] };

    case "clear":
      return { output: [], clear: true };

    case "cmatrix":
      return { output: [{ text: t("interactiveTerminal.cmatrix"), kind: "dim" }], matrixRain: true };

    case "ed":
      return {
        output: [
          { text: t("interactiveTerminal.edLine1"), kind: "dim" },
          { text: t("interactiveTerminal.edLine2"), kind: "dim" },
        ],
      };

    case "neofetch":
      return {
        output: [
          ...FACE_ART.map((l) => ({ text: l, kind: "dim" }) as TerminalLine),
          prompt(`${ctx.username}@${ctx.host}`),
          { text: "-".repeat(Math.max(ctx.username.length + ctx.host.length + 1, 12)), kind: "dim" },
          { text: t("interactiveTerminal.neofetchOs", { brand: ctx.brand }), kind: "dim" },
          { text: t("interactiveTerminal.neofetchHost", { name: ctx.displayName ?? ctx.username }), kind: "dim" },
          { text: t("interactiveTerminal.neofetchKernel"), kind: "dim" },
          { text: t("interactiveTerminal.neofetchUptime"), kind: "dim" },
          { text: t("interactiveTerminal.neofetchShell"), kind: "dim" },
          { text: t("interactiveTerminal.neofetchResolution"), kind: "dim" },
          { text: t("interactiveTerminal.neofetchWm"), kind: "dim" },
          { text: t("interactiveTerminal.neofetchTerminal"), kind: "dim" },
          { text: t("interactiveTerminal.neofetchTheme", { username: ctx.username }), kind: "dim" },
          { text: t("interactiveTerminal.neofetchCpu"), kind: "dim" },
          { text: t("interactiveTerminal.neofetchMemory"), kind: "dim" },
        ],
      };

    case "matrix":
      return {
        output: [
          { text: t("interactiveTerminal.matrixLine1"), kind: "accent" },
          { text: t("interactiveTerminal.matrixLine2"), kind: "accent" },
          { text: t("interactiveTerminal.matrixLine3"), kind: "accent" },
          { text: t("interactiveTerminal.matrixLine4"), kind: "accent" },
          // Binary signal line — intentionally not translated (it is not language).
          { text: "01001001 00100000 01101011 01101110 01101111 01110111", kind: "dim" },
        ],
      };

    case "sl":
      return { output: TRAIN_ART.map((l) => ({ text: l, kind: "dim" }) as TerminalLine) };

    case "sudo":
      return {
        output: [
          { text: t("interactiveTerminal.sudoNotInSudoers", { username: ctx.username }), kind: "dim" },
          { text: t("interactiveTerminal.sudoReported"), kind: "dim" },
        ],
      };

    case "exit":
      return { output: [{ text: t("interactiveTerminal.exitNoEscape"), kind: "dim" }] };

    case "vim":
      return { output: [{ text: t("interactiveTerminal.vimEd"), kind: "dim" }] };

    case "pwd":
      return { output: [{ text: `/home/${ctx.username}`, kind: "dim" }] };

    case "uname":
      return { output: [{ text: `BioTerm ${ctx.brand} 6.9.0-bio x86_64`, kind: "dim" }] };

    default: {
      const custom = ctx.terminalCommands?.find((c) => c.command.toLowerCase() === cmd);
      if (custom) {
        const output: TerminalLine[] = [{ text: custom.output }];
        if (custom.url) {
          const copy = !/^(https?:|mailto:)/i.test(custom.url);
          if (!copy) output.push({ text: custom.url, url: custom.url });
          return { output, open: { url: custom.url, copy } };
        }
        return { output };
      }
      return {
        output: [
          { text: t("interactiveTerminal.commandNotFound", { cmd }), kind: "dim" },
          { text: getHintText(t), kind: "dim" },
        ],
      };
    }
  }
}
