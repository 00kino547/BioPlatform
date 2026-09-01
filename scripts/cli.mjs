import { spawn } from "node:child_process";

const isWin = process.platform === "win32";
const scriptName = isWin ? "bioplatform.ps1" : "bioplatform.sh";
const shell = isWin ? "powershell.exe" : "sh";
const args = isWin
  ? ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", `scripts/${scriptName}`, ...process.argv.slice(2)]
  : [`scripts/${scriptName}`, ...process.argv.slice(2)];

const child = spawn(shell, args, { stdio: "inherit", cwd: process.cwd() });
child.on("exit", (code) => process.exit(code ?? 1));