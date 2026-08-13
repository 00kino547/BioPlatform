import crypto from "crypto";
import type { Request } from "express";

export function contentEtag(payload: unknown): string {
  return `"${crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex")}"`;
}

export function clientHasFreshBody(req: Request, etag: string): boolean {
  return req.headers["if-none-match"] === etag;
}
