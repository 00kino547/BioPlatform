// File fingerprinting for the DMCA / takedown system.
//
// Every stored user file (avatar, banner, link icon, music track, shop preview,
// shop product) is fingerprinted at upload time with:
//
//   1. SHA-256 of the exact bytes — a byte-for-byte copy of a banned file is
//      detected trivially, regardless of filename, extension or account.
//   2. A perceptual image hash (64-bit DCT pHash) — only for images. Resizing,
//      recompression and subtle edits change the bytes but keep the picture
//      "the same image" to a viewer; the pHash distance measures that instead
//      of the bytes.
//
// The fingerprints live in `media_files` for every upload and in
// `banned_hashes` for everything an operator bans. `guardUpload()` both checks
// the incoming file against the active ban list (throwing `MediaBannedError`
// when it matches) and records the new fingerprint, so a takedown of one copy
// retroactively finds every other copy already stored for any account.
//
// Design notes:
//   - Only the DCT low-frequency 8x8 block is kept (the standard "resemble"
//     pHash). The comparison metric is Hamming distance between the two 64-bit
//     hashes; `PERCEPTUAL_HAMMING_THRESHOLD` is the "same image" cutoff.
//   - Hashing happens on the multer temp file BEFORE `writeUpload()` pushes it
//     to the storage provider, so we never fingerprint a copy we then cannot
//     cheaply clean up, and provider upload only happens for allowed files.
//   - No new dependencies: SHA-256 via node:crypto, pHash via the `sharp`
//     already used by the image pipeline.

import crypto from "node:crypto";
import fs from "node:fs";
import type { Response } from "express";
import sharp from "sharp";
import type { BannedHash, MediaKind } from "@prisma/client";
import { prisma } from "./prisma.js";

/**
 * How close a perceptual hash must be to count as "the same image".
 *
 * pHashes are 64 bits. A zero distance is the identical image even after
 * recompression; small distances (a few bits apart) still mean the same visual
 * content under minor edits. 10 is a deliberately lenient cutoff so that an
 * edited re-upload cannot dodge a takedown, at the small cost of an occasional
 * false positive that an operator can clear with an unban.
 */
export const PERCEPTUAL_HAMMING_THRESHOLD = 10;

/** The k-dimensional DCT low-frequency block kept from the resized image. */
const PHASH_BLOCK = 8;
/** pHash input raster: 32x32 grayscale (1024 samples), standard for pHash. */
const PHASH_SIZE = 32;

/** Kinds that carry visual identity and therefore get a perceptual hash. */
const IMAGE_KINDS: ReadonlySet<MediaKind> = new Set([
  "AVATAR",
  "BANNER",
  "LINK_ICON",
  "BACKGROUND",
  "SHOP_PREVIEW",
]);

export interface UploadFingerprint {
  /** SHA-256 of the exact bytes, lowercase hex. Always present. */
  sha256: string;
  /** Perceptual image hash as 16 hex chars (64 bits). NULL for non-images. */
  pHashHex: string | null;
}

/** Thrown by `guardUpload` when the file matches an active ban record. */
export class MediaBannedError extends Error {
  constructor(
    /** The active BannedHash row the file matched. */
    readonly banned: BannedHash,
  ) {
    super("This file matches a banned fingerprint and cannot be uploaded.");
    this.name = "MediaBannedError";
  }
}

/** True when the kind is an image that should get a perceptual hash. */
export function kindUsesPerceptualHash(kind: MediaKind): boolean {
  return IMAGE_KINDS.has(kind);
}

/** Streaming SHA-256 of a file on disk. */
export async function sha256File(absPath: string): Promise<string> {
  const hash = crypto.createHash("sha256");
  const stream = fs.createReadStream(absPath);
  for await (const chunk of stream) {
    hash.update(chunk as Buffer);
  }
  return hash.digest("hex");
}

/* ---------------------------------------------------------------------------
 * Perceptual hash (DCT pHash)
 * ------------------------------------------------------------------------- */

/** 2-D DCT coefficient (u,v) of the 32x32 grayscale raster. */
function dctCoefficient(raster: Uint8Array, u: number, v: number): number {
  const N = PHASH_SIZE;
  const au = u === 0 ? Math.sqrt(1 / N) : Math.sqrt(2 / N);
  const av = v === 0 ? Math.sqrt(1 / N) : Math.sqrt(2 / N);
  let sum = 0;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const px = raster[y * N + x] - 128;
      sum += px * Math.cos((Math.PI * (x + 0.5) * u) / N) * Math.cos((Math.PI * (y + 0.5) * v) / N);
    }
  }
  return au * av * sum;
}

/**
 * 64-bit DCT-based perceptual hash of an image file.
 *
 * Pipeline: decode -> resize to 32x32 (stretching, matching pHash.org
 * behaviour) -> grayscale raw -> 8x8 low-frequency DCT block -> median-threshold
 * the 63 AC coefficients (the DC term carries only overall brightness, which
 * re-encoding changes) -> bits into a 16-char lowercase hex string.
 *
 * Returns NULL when the file cannot be decoded as an image or the read fails —
 * audio and binaries are not hashed here, and a corrupt image bytes-wise still
 * has its SHA-256 checked above.
 */
export async function computePerceptualHash(absPath: string): Promise<string | null> {
  try {
    const { data } = await sharp(absPath)
      .resize(PHASH_SIZE, PHASH_SIZE, { fit: "fill" })
      .grayscale()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const raster = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);

    // All 63 AC coefficients of the top-left 8x8 block.
    const coeffs: number[] = [];
    for (let v = 0; v < PHASH_BLOCK; v++) {
      for (let u = 0; u < PHASH_BLOCK; u++) {
        if (u === 0 && v === 0) continue; // DC term: overall brightness, not identity.
        coeffs.push(dctCoefficient(raster, u, v));
      }
    }
    const sorted = [...coeffs].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];

    let bits = "";
    for (let v = 0; v < PHASH_BLOCK; v++) {
      for (let u = 0; u < PHASH_BLOCK; u++) {
        if (u === 0 && v === 0) continue;
        bits += dctCoefficient(raster, u, v) >= median ? "1" : "0";
      }
    }
    const hex = BigInt(`0b${bits.slice(0, 64)}`)
      .toString(16)
      .padStart(16, "0");
    return hex.length === 16 ? hex : null;
  } catch {
    return null;
  }
}

/** Number of differing bits between two equal-length lowercase hex strings. */
export function hammingDistance(hexA: string, hexB: string): number {
  if (hexA === hexB) return 0;
  const a = BigInt(`0x${hexA}`);
  const b = BigInt(`0x${hexB}`);
  let xor = a ^ b;
  let distance = 0;
  while (xor !== 0n) {
    distance += Number(xor & 1n);
    xor >>= 1n;
  }
  return distance;
}

/** Standard 409 response for a banned upload. Returns `res` for early return. */
export function sendBannedUploadError(res: Response, _err: MediaBannedError): Response {
  return res.status(409).json({
    success: false,
    code: "banned_media",
    error: "This file matches a banned fingerprint (copyright takedown) and cannot be uploaded.",
  });
}

/**
 * Guard an upload against the ban registry, mapping a rejection to the standard
 * 409 while rethrowing any genuine server error. `guardUpload` already unlinks
 * the temp file on a match, so the handler needs no extra cleanup.
 */
export async function guardUploadOrRespond(
  res: Response,
  params: {
    absPath: string;
    kind: MediaKind;
    userId: string;
    profileId?: string | null;
    filePath: string;
  },
): Promise<UploadFingerprint | null> {
  try {
    return await guardUpload(params);
  } catch (err) {
    if (err instanceof MediaBannedError) {
      sendBannedUploadError(res, err);
      return null;
    }
    throw err;
  }
}

/* ---------------------------------------------------------------------------
 * Ban-check + record
 * ------------------------------------------------------------------------- */

/**
 * Compute the fingerprint of a freshly-written multer temp file, reject it if
 * it matches an active ban, and record it in `media_files`.
 *
 * On a match the temp file is unlinked (the upload never happened) and a
 * `MediaBannedError` is thrown for the caller to translate into a 409. The ban
 * check is one DB query of all currently-live bans, compared in memory, so the
 * exact-bytes and perceptual comparisons share a single round-trip.
 */
export async function guardUpload(params: {
  /** Absolute path of the multer temp file. */
  absPath: string;
  kind: MediaKind;
  userId: string;
  profileId?: string | null;
  /** The relative `/uploads/...` path the owning model row will store. */
  filePath: string;
}): Promise<UploadFingerprint> {
  const { absPath, kind, userId, profileId, filePath } = params;

  const sha256 = await sha256File(absPath);
  const pHashHex = kindUsesPerceptualHash(kind) ? await computePerceptualHash(absPath) : null;

  const active = await prisma.bannedHash.findMany({
    where: { unbannedAt: null },
    select: {
      id: true,
      sha256: true,
      pHashHex: true,
      reason: true,
      dmcaReportId: true,
    },
  });

  // Exact-bytes match: a byte-for-byte copy of a banned file.
  const exactMatch = active.find((b) => b.sha256 === sha256);
  if (exactMatch) {
    await fs.promises.unlink(absPath).catch(() => undefined);
    throw new MediaBannedError(exactMatch as BannedHash);
  }

  // Perceptual match: same picture despite re-encoding/edits (images only —
  // audio/product files have no pHash, so only the exact check applies).
  if (pHashHex) {
    const perceptualMatch = active.find(
      (b) => b.pHashHex !== null && hammingDistance(pHashHex, b.pHashHex) <= PERCEPTUAL_HAMMING_THRESHOLD,
    );
    if (perceptualMatch) {
      await fs.promises.unlink(absPath).catch(() => undefined);
      throw new MediaBannedError(perceptualMatch as BannedHash);
    }
  }

  // Allowed: keep the fingerprint for future takedown lookups.
  await prisma.mediaFile.create({
    data: { userId, profileId: profileId ?? null, kind, sha256, pHashHex, filePath },
  });

  return { sha256, pHashHex };
}