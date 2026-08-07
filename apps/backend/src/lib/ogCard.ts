import fs from "fs";
import path from "path";
import { createCanvas, loadImage, GlobalFonts } from "@napi-rs/canvas";
import { getEnv } from "../config/env.js";

const WIDTH = 1200;
const HEIGHT = 630;

const STATUS_COLORS: Record<string, string> = {
  online: "#3ba55d",
  idle: "#faa61a",
  dnd: "#ed4245",
  offline: "#747f8d",
};

const STATUS_LABELS: Record<string, string> = {
  online: "Online",
  idle: "Idle",
  dnd: "Do Not Disturb",
  offline: "Offline",
};

const REGULAR_CANDIDATES = [
  "/usr/share/fonts/inter/Inter-Regular.ttf",
  "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
  "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
];

const BOLD_CANDIDATES = [
  "/usr/share/fonts/inter/Inter-Bold.ttf",
  "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
  "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
];

let fontsReady = false;

function ensureFonts(): void {
  if (fontsReady) return;
  fontsReady = true;
  for (const file of REGULAR_CANDIDATES) {
    if (fs.existsSync(file)) GlobalFonts.registerFromPath(file, "OgRegular");
  }
  for (const file of BOLD_CANDIDATES) {
    if (fs.existsSync(file)) GlobalFonts.registerFromPath(file, "OgBold");
  }
}

function parseHexColor(value: string | null | undefined, fallback: number): number {
  if (typeof value !== "string") return fallback;
  const match = /^#([0-9a-fA-F]{6})$/.exec(value.trim());
  if (!match) return fallback;
  return Number.parseInt(match[1], 16);
}

export interface OgCardInput {
  username: string;
  displayName: string | null;
  bio: string | null;
  avatar: string | null;
  accent: string | null;
  status: "online" | "idle" | "dnd" | "offline" | null;
  activityLine: string | null;
  customStatus: string | null;
  linkCount: number;
  trackCount: number;
  appName: string;
}

interface CanvasContext {
  fillStyle: unknown;
  font: string;
  textAlign?: "left" | "right" | "center" | "start" | "end";
  measureText(text: string): { width: number };
  roundRect(x: number, y: number, w: number, h: number, r: number): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  arc(x: number, y: number, r: number, a: number, b: number): void;
  fill(): void;
  beginPath(): void;
  save(): void;
  restore(): void;
  clip(): void;
  translate(x: number, y: number): void;
  drawImage(image: unknown, x: number, y: number, w: number, h: number): void;
  fillText(text: string, x: number, y: number, maxWidth?: number): void;
}

interface OgCanvasContext extends CanvasContext {
  createLinearGradient(x0: number, y0: number, x1: number, y1: number): { addColorStop(offset: number, color: string): void };
  globalAlpha: number;
  strokeStyle: unknown;
  lineWidth: number;
  stroke(): void;
}

function wrapText(ctx: CanvasContext, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
    if (lines.length === 3) break;
  }
  if (lines.length < 3 && line) lines.push(line);
  return lines;
}

function truncate(ctx: CanvasContext, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let result = text;
  while (result.length > 1 && ctx.measureText(`${result}…`).width > maxWidth) {
    result = result.slice(0, -1);
  }
  return `${result}…`;
}

async function loadAvatarImage(avatar: string | null): Promise<unknown | null> {
  try {
    if (!avatar) return null;
    if (/^https?:\/\//i.test(avatar)) {
      return await loadImage(avatar);
    }
    if (avatar.startsWith("/uploads/")) {
      const filePath = path.resolve(getEnv().LOCAL_STORAGE_PATH, path.basename(avatar));
      if (fs.existsSync(filePath)) return await loadImage(filePath);
    }
    return null;
  } catch {
    return null;
  }
}

export async function renderOgCard(input: OgCardInput): Promise<Buffer> {
  ensureFonts();

  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext("2d") as unknown as OgCanvasContext;

  const gradient = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  gradient.addColorStop(0, "#0b0b0f");
  gradient.addColorStop(1, "#19112b");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const accent = parseHexColor(input.accent, 0x7c3aed);
  ctx.fillStyle = accent;
  ctx.globalAlpha = 0.12;
  ctx.beginPath();
  ctx.arc(WIDTH - 90, 80, 260, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  const avatarImage = await loadAvatarImage(input.avatar);
  const avatarX = 110;
  const avatarY = 315;
  const avatarR = 110;

  ctx.save();
  ctx.beginPath();
  ctx.arc(avatarX, avatarY, avatarR, 0, Math.PI * 2);
  ctx.clip();
  if (avatarImage) {
    ctx.drawImage(avatarImage, avatarX - avatarR, avatarY - avatarR, avatarR * 2, avatarR * 2);
  } else {
    ctx.fillStyle = "#27272a";
    ctx.fillRect(avatarX - avatarR, avatarY - avatarR, avatarR * 2, avatarR * 2);
  }
  ctx.restore();

  ctx.strokeStyle = accent;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(avatarX, avatarY, avatarR + 4, 0, Math.PI * 2);
  ctx.stroke();

  const name = input.displayName || input.username;
  ctx.font = "700 54px OgBold, Inter, sans-serif";
  ctx.fillStyle = "#fafafa";
  ctx.fillText(truncate(ctx, name, 760), 270, 255, 760);

  ctx.font = "400 34px OgRegular, Inter, sans-serif";
  ctx.fillStyle = "#a1a1aa";
  ctx.fillText(`@${input.username}`, 272, 312, 760);

  let y = 372;
  const status = input.status ?? null;
  if (status) {
    const color = STATUS_COLORS[status] ?? "#747f8d";
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(286, y - 10, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = "500 30px OgRegular, Inter, sans-serif";
    ctx.fillStyle = "#e4e4e7";
    ctx.fillText(STATUS_LABELS[status] ?? status, 318, y, 720);
    y += 48;
  }

  if (input.customStatus) {
    ctx.font = "400 28px OgRegular, Inter, sans-serif";
    ctx.fillStyle = "#c4b5fd";
    ctx.fillText(truncate(ctx, input.customStatus, 720), 280, y, 720);
    y += 44;
  }

  if (input.activityLine) {
    ctx.font = "500 28px OgRegular, Inter, sans-serif";
    ctx.fillStyle = "#a78bfa";
    ctx.fillText(truncate(ctx, input.activityLine, 720), 280, y, 720);
    y += 44;
  }

  if (input.bio) {
    ctx.font = "400 26px OgRegular, Inter, sans-serif";
    ctx.fillStyle = "#9ca3af";
    const lines = wrapText(ctx, input.bio, 820);
    let ly = Math.max(y + 18, 440);
    for (const line of lines.slice(0, 3)) {
      ctx.fillText(line, 110, ly, 820);
      ly += 34;
    }
  }

  const stats: string[] = [];
  if (input.linkCount > 0) stats.push(`${input.linkCount} link${input.linkCount === 1 ? "" : "s"}`);
  if (input.trackCount > 0) stats.push(`${input.trackCount} track${input.trackCount === 1 ? "" : "s"}`);
  if (stats.length > 0) {
    ctx.font = "500 26px OgRegular, Inter, sans-serif";
    ctx.fillStyle = "#71717a";
    ctx.fillText(stats.join("  ·  "), 110, 565, 600);
  }

  ctx.font = "600 24px OgBold, Inter, sans-serif";
  ctx.fillStyle = "#52525b";
  ctx.textAlign = "right";
  ctx.fillText(input.appName, WIDTH - 110, 565, 400);
  ctx.textAlign = "left";

  return canvas.toBuffer("image/png");
}

export function statusOf(presence: { status: string } | null): "online" | "idle" | "dnd" | "offline" | null {
  if (!presence) return null;
  if (presence.status === "online" || presence.status === "idle" || presence.status === "dnd" || presence.status === "offline") {
    return presence.status;
  }
  return null;
}
