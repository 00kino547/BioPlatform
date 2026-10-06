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

export const HINT_TEXT = "Type \"help\" to see available commands.";

export const HELP_TEXT: TerminalLine[] = [
  { text: "help               show this help", kind: "dim" },
  { text: "whoami             print your identity", kind: "dim" },
  { text: "ls                 list files and links", kind: "dim" },
  { text: "cat <file>         read a file (whoami.txt, bio.txt)", kind: "dim" },
  { text: "open <link> [i]     open a link by name / index (e.g. open github 0)", kind: "dim" },
  { text: "date               print the current date", kind: "dim" },
  { text: "echo <text>        echo text back", kind: "dim" },
  { text: "clear              clear the terminal", kind: "dim" },
];

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

export function runCommand(raw: string, ctx: TerminalContext): TerminalResult {
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
          { text: "Available commands:", kind: "dim" },
          ...HELP_TEXT,
          ...(ctx.terminalCommands && ctx.terminalCommands.length > 0
            ? [
                { text: "", kind: "dim" } as TerminalLine,
                { text: "Custom commands:", kind: "dim" } as TerminalLine,
                ...ctx.terminalCommands.map((c): TerminalLine => ({
                  text: `${c.command.padEnd(20)} ${(c.description || c.output.split("\n")[0]).slice(0, 40)}`,
                  kind: "dim",
                })),
              ]
            : []),
        ],
      };

    case "whoami":
      return { output: [prompt(`${ctx.displayName ?? ctx.username} @ ${ctx.username}`)] };

    case "ls": {
      const target = args[0]?.toLowerCase().replace(/\/+$/, "") || undefined;
      const files: TerminalLine = { text: "whoami.txt   bio.txt", kind: "dim" };
      const linksRow: TerminalLine = {
        text: `links/  ${printableLinks(ctx).map((l) => l.name).join("  ")}`,
        kind: "dim",
      };
      const cmdsRow: TerminalLine = {
        text: `cmds/  ${ctx.terminalCommands?.map((c) => c.command).join("  ") ?? ""}`,
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
          return { output: [{ text: `ls: cannot access '${args[0]}': No such file or directory`, kind: "dim" }] };
        }
        return { output: [cmdsRow] };
      }
      if (target === "whoami.txt" || target === "bio.txt") return { output: [files] };
      return { output: [{ text: `ls: cannot access '${args[0]}': No such file or directory`, kind: "dim" }] };
    }

    case "cat": {
      const file = args[0]?.toLowerCase();
      if (!file) return { output: [{ text: `cat: missing file operand`, kind: "dim" }] };
      if (file === "whoami.txt") {
        return {
          output: [
            prompt(`${ctx.displayName ?? ctx.username}`),
            { text: `@ ${ctx.username}`, kind: "dim" },
          ],
        };
      }
      if (file === "bio.txt") {
        if (!ctx.bio) return { output: [{ text: "bio.txt is empty", kind: "dim" }] };
        return { output: [{ text: ctx.bio }] };
      }
      return { output: [{ text: `cat: ${args[0]}: No such file or directory`, kind: "dim" }] };
    }

    case "open": {
      const needle = args[0];
      if (!needle) return { output: [{ text: "usage: open <link> [index]", kind: "dim" }] };
      const matches = findLinks(ctx, needle);
      if (matches.length === 0) {
        return { output: [{ text: `open: ${needle}: no such link`, kind: "dim" }] };
      }
      if (matches.length > 1 && args.length < 2) {
        return {
          output: [
            { text: `${matches.length} '${needle}' links found:`, kind: "dim" },
            ...matches.map((m, i) => ({ text: `[${i}] ${m.name} — ${m.url}`, kind: "dim" }) as TerminalLine),
            { text: `Run 'open ${needle} <index>' to pick one.`, kind: "dim" },
          ],
        };
      }
      let link = matches[0];
      if (matches.length > 1) {
        const idx = Number(args[1]);
        if (!Number.isInteger(idx) || idx < 0 || idx >= matches.length) {
          return {
            output: [{ text: `open: ${needle}: invalid index '${args[1]}' (expected 0-${matches.length - 1})`, kind: "dim" }],
          };
        }
        link = matches[idx];
      }
      const copy = !/^(https?:|mailto:)/i.test(link.url);
      const output: TerminalLine[] = [
        copy
          ? { text: `Copied ${link.name} to clipboard.`, kind: "dim" }
          : { text: `Opening ${link.name}...`, kind: "dim" },
      ];
      if (!copy) output.push({ text: link.url, url: link.url });
      return { output, open: { url: link.url, copy } };
    }

    case "date":
      return { output: [{ text: new Date().toLocaleString() }] };

    case "echo":
      return rest ? { output: [{ text: rest }] } : { output: [] };

    case "clear":
      return { output: [], clear: true };

    case "cmatrix":
      return { output: [{ text: "Entering the Matrix...", kind: "dim" }], matrixRain: true };

    case "ed":
      return {
        output: [
          { text: "ed is the standard text editor.", kind: "dim" },
          { text: "This is not a joke. Only heroes use ed.", kind: "dim" },
        ],
      };

    case "neofetch":
      return {
        output: [
          ...FACE_ART.map((l) => ({ text: l, kind: "dim" }) as TerminalLine),
          prompt(`${ctx.username}@${ctx.host}`),
          { text: "-".repeat(Math.max(ctx.username.length + ctx.host.length + 1, 12)), kind: "dim" },
          { text: `OS:        ${ctx.brand} Web`, kind: "dim" },
          { text: `Host:      ${ctx.displayName ?? ctx.username}'s PC`, kind: "dim" },
          { text: "Kernel:    6.9.0-bio", kind: "dim" },
          { text: "Uptime:    0 days (just booted)", kind: "dim" },
          { text: "Shell:     zsh 5.9", kind: "dim" },
          { text: "Resolution: 1920x1080", kind: "dim" },
          { text: "WM:        None", kind: "dim" },
          { text: "Terminal:  bio-term", kind: "dim" },
          { text: `Theme:     ${ctx.username}`, kind: "dim" },
          { text: "CPU:       1 core @ powered by will", kind: "dim" },
          { text: "Memory:    plenty", kind: "dim" },
        ],
      };

    case "matrix":
      return {
        output: [
          { text: "Wake up, Neo...", kind: "accent" },
          { text: "The Matrix has you...", kind: "accent" },
          { text: "Follow the white rabbit.", kind: "accent" },
          { text: "Knock, knock, Neo.", kind: "accent" },
          { text: "01001001 00100000 01101011 01101110 01101111 01110111", kind: "dim" },
        ],
      };

    case "sl":
      return { output: TRAIN_ART.map((l) => ({ text: l, kind: "dim" }) as TerminalLine) };

    case "sudo":
      return {
        output: [
          { text: `${ctx.username} is not in the sudoers file.`, kind: "dim" },
          { text: "This incident will be reported. (to a real sysadmin)", kind: "dim" },
        ],
      };

    case "exit":
      return { output: [{ text: "There is no escape from the terminal.", kind: "dim" }] };

    case "vim":
      return { output: [{ text: "real programmers use ed.", kind: "dim" }] };

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
          { text: `zsh: command not found: ${cmd}`, kind: "dim" },
          { text: HINT_TEXT, kind: "dim" },
        ],
      };
    }
  }
}