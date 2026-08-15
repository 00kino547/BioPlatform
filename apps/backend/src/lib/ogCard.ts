import fs from "fs";
import path from "path";
import { createCanvas, loadImage, GlobalFonts } from "@napi-rs/canvas";
import { getEnv } from "../config/env.js";

const WIDTH = 1200;
const HEIGHT = 630;
const BANNER_HEIGHT = 300;

const REGULAR_CANDIDATES = [
  "/usr/share/fonts/inter/Inter-Regular.ttf",
  "/usr/share/fonts/liberation/LiberationSans-Regular.ttf",
  "/usr/share/fonts/dejavu/DejaVuSans.ttf",
  "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
  "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
];

const BOLD_CANDIDATES = [
  "/usr/share/fonts/inter/Inter-Bold.ttf",
  "/usr/share/fonts/liberation/LiberationSans-Bold.ttf",
  "/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf",
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

function parseHexColor(value: string | null | undefined, fallback: string): string {
  if (typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value.trim())) {
    return value.trim();
  }
  return fallback;
}

export interface OgCardInput {
  username: string;
  displayName: string | null;
  bio: string | null;
  avatar: string | null;
  banner: string | null;
  accent: string | null;
  linkCount: number;
  trackCount: number;
  badges: { slug: string; label: string; color: string }[];
  socialLinks: { platform: string }[];
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
  closePath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  arcTo(x1: number, y1: number, x2: number, y2: number, r: number): void;
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

function withAlpha(hex: string, alpha: number): string {
  const match = /^#([0-9a-fA-F]{6})$/.exec(hex);
  if (!match) return hex;
  const r = Number.parseInt(match[1].slice(0, 2), 16);
  const g = Number.parseInt(match[1].slice(2, 4), 16);
  const b = Number.parseInt(match[1].slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function roundedRectPath(ctx: OgCanvasContext, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function drawBadgePill(ctx: OgCanvasContext, label: string, color: string, x: number, y: number): void {
  ctx.font = "600 18px OgBold, Inter, sans-serif";
  const width = ctx.measureText(label).width + 34;
  const height = 30;
  roundedRectPath(ctx, x, y, width, height, height / 2);
  ctx.fillStyle = withAlpha(color, 0.22);
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = "#fafafa";
  ctx.fillText(label, x + 17, y + 20);
}

function drawSocialTile(ctx: OgCanvasContext, platform: string, x: number, y: number): void {
  const label = platform.replace(/\s+/g, "").slice(0, 2).toUpperCase();
  ctx.font = "600 18px OgBold, Inter, sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.07)";
  ctx.beginPath();
  ctx.arc(x, y, 18, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.16)";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = "#d4d4d8";
  ctx.textAlign = "center";
  ctx.fillText(label, x, y + 6);
  ctx.textAlign = "left";
}

function drawCoverImage(ctx: OgCanvasContext, image: unknown, x: number, y: number, w: number, h: number): void {
  const img = image as { width: number; height: number };
  if (!img.width || !img.height) return;
  const scale = Math.max(w / img.width, h / img.height);
  const dw = img.width * scale;
  const dh = img.height * scale;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
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

  const accent = parseHexColor(input.accent, "#7c3aed");

  const bannerImage = await loadAvatarImage(input.banner);
  if (bannerImage) {
    drawCoverImage(ctx, bannerImage, 0, 0, WIDTH, BANNER_HEIGHT);
  }

  const bodyGradient = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  bodyGradient.addColorStop(0, bannerImage ? "#17171d" : "#0b0b0f");
  bodyGradient.addColorStop(1, bannerImage ? "#0b0b10" : "#19112b");
  ctx.fillStyle = bodyGradient;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  if (bannerImage) {
    const bannerOverlay = ctx.createLinearGradient(0, BANNER_HEIGHT - 160, 0, BANNER_HEIGHT);
    bannerOverlay.addColorStop(0, "rgba(11,11,15,0)");
    bannerOverlay.addColorStop(1, "rgba(11,11,15,0.8)");
    ctx.fillStyle = bannerOverlay;
    ctx.fillRect(0, 0, WIDTH, BANNER_HEIGHT);
  }

  ctx.fillStyle = accent;
  ctx.globalAlpha = 0.14;
  ctx.beginPath();
  ctx.arc(WIDTH - 110, 90, 280, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  let badgeX = 60;
  let badgeY = 84;
  for (const badge of input.badges ?? []) {
    ctx.font = "600 18px OgBold, Inter, sans-serif";
    const width = ctx.measureText(badge.label).width + 34;
    if (badgeX + width > WIDTH - 70) {
      badgeX = 60;
      badgeY += 40;
    }
    drawBadgePill(ctx, badge.label, badge.color, badgeX, badgeY);
    badgeX += width + 10;
  }

  const avatarImage = await loadAvatarImage(input.avatar);
  const avatarX = 150;
  const avatarY = 300;
  const avatarR = 108;

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
  ctx.font = "700 48px OgBold, Inter, sans-serif";
  ctx.fillStyle = "#fafafa";
  ctx.fillText(truncate(ctx, name, 680), 310, 270, 680);

  ctx.font = "400 28px OgRegular, Inter, sans-serif";
  ctx.fillStyle = "#c7c7ce";
  ctx.fillText(`@${input.username}`, 312, 314, 680);

  if (input.bio) {
    ctx.font = "400 25px OgRegular, Inter, sans-serif";
    ctx.fillStyle = "#d4d4d8";
    const lines = wrapText(ctx, input.bio, 980);
    let ly = 442;
    for (const line of lines.slice(0, 3)) {
      if (ly > 540) break;
      ctx.fillText(line, 110, ly, 980);
      ly += 32;
    }
  }

  const socials = (input.socialLinks ?? []).slice(0, 8);
  const startX = 78;
  socials.forEach((social, index) => {
    drawSocialTile(ctx, social.platform, startX + index * 44, 522);
  });

  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(60, 562);
  ctx.lineTo(WIDTH - 60, 562);
  ctx.stroke();

  const stats: string[] = [];
  if (input.linkCount > 0) stats.push(`${input.linkCount} link${input.linkCount === 1 ? "" : "s"}`);
  if (input.trackCount > 0) stats.push(`${input.trackCount} track${input.trackCount === 1 ? "" : "s"}`);
  if (stats.length > 0) {
    ctx.font = "500 24px OgRegular, Inter, sans-serif";
    ctx.fillStyle = "#71717a";
    ctx.fillText(stats.join("  ·  "), 60, 597, 500);
  }

  ctx.font = "600 22px OgBold, Inter, sans-serif";
  ctx.fillStyle = "#52525b";
  ctx.textAlign = "right";
  ctx.fillText(input.appName, WIDTH - 60, 597, 400);
  ctx.textAlign = "left";

  return canvas.toBuffer("image/png");
}
