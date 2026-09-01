import { spawn } from "node:child_process";

const isWin = process.platform === "win32";
const scriptName = isWin ? "build.ps1" : "build.sh";
const shell = isWin ? "powershell.exe" : "sh";
const args = isWin
  ? ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", `scripts/${scriptName}`]
  : [`scripts/${scriptName}`];

const child = spawn(shell, args, { stdio: "inherit", cwd: process.cwd() });
child.on("exit", (code) => process.exit(code ?? 1));