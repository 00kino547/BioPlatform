import { gzipSync, gunzipSync } from "zlib";
import { getEnv } from "../../config/env.js";
import type { MediaWriteOptions, StorageProvider, StoredObject } from "./types.js";

const MIN_COMPRESSIBLE_BYTES = 1024;
const MARKER_SUFFIX = ".bio-compressed";
const MARKER_VALUE = "bioplatform-gzip-v1";
// Second marker value: the object was stored VERBATIM (it already had gzip magic
// bytes when it was uploaded, so we must not recompress it — and, just as
// importantly, reads must not mistake it for one of our markerless legacy
// compressed objects and gunzip the operator's own .gz file into garbage).
const MARKER_VALUE_RAW = "bioplatform-raw-v1";

function markerName(name: string): string {
  return name + MARKER_SUFFIX;
}

const GZIP_MAGIC: readonly number[] = [0x1f, 0x8b];

export function looksGzipped(data: Buffer): boolean {
  return data.length >= 2 && data[0] === GZIP_MAGIC[0] && data[1] === GZIP_MAGIC[1];
}

export function maybeCompress(data: Buffer): Buffer {
  if (!getEnv().STORAGE_COMPRESS_ENABLED || data.length < MIN_COMPRESSIBLE_BYTES || looksGzipped(data)) return data;
  return gzipSync(data, { level: 9 });
}

export function decompressIfNeeded(data: Buffer): Buffer {
  return looksGzipped(data) ? gunzipSync(data) : data;
}

interface CompressionOptions {
  read?: boolean;
  write?: boolean;
}

export function withCompression(
  provider: StorageProvider,
  opts: CompressionOptions = {}
): StorageProvider {
  const read = opts.read ?? true;
  const write = opts.write ?? true;

  async function readObject(name: string): Promise<Buffer | null> {
    const data = await provider.readObject(name);
    if (!data) return null;
    if (!read) return data;
    const marker = await provider.readObject(markerName(name));
    if (marker) {
      const value = marker.toString("utf8");
      if (value === MARKER_VALUE) {
        try { return decompressIfNeeded(data); } catch { return data; }
      }
      // Any other marker value is an explicit record that we stored the bytes
      // as-is (MARKER_VALUE_RAW, or an unrecognised future value). Trust the
      // marker over the gzip-magic heuristic below, so a user-uploaded .gz is
      // never silently unwrapped on download.
      return data;
    }
    // Legacy fallback: older deployments stored gzip-compressed objects without
    // a `.bio-compressed` marker (e.g. writes that failed part-way through the
    // marker upload). The gzip magic bytes (0x1f 0x8b) can never start a valid
    // PNG/JPEG/WebP file, so decompressing on magic detection is safe and lets
    // those objects keep serving correctly. Gated on `write` so read-only
    // wrappers never alter stored bytes. A markerless object we wrote ourselves
    // always carries a marker (see writeObject), so this only ever fires for
    // genuinely legacy bytes.
    if (write && looksGzipped(data)) {
      try { return decompressIfNeeded(data); } catch { return data; }
    }
    return data;
  }

  async function writeObject(name: string, data: Buffer, wopts?: MediaWriteOptions): Promise<void> {
    if (!write) {
      await provider.writeObject(name, data, wopts);
      return;
    }
    const out = maybeCompress(data);
    if (out !== data) {
      await Promise.all([
        provider.writeObject(name, out, wopts),
        provider.writeObject(markerName(name), Buffer.from(MARKER_VALUE, "utf8")),
      ]);
    } else if (looksGzipped(data)) {
      // Already gzip (e.g. an operator uploaded a .gz product file): store the
      // bytes verbatim and drop the passthrough marker so reads do not apply the
      // legacy magic-byte fallback and decompress it.
      await Promise.all([
        provider.writeObject(name, data, wopts),
        provider.writeObject(markerName(name), Buffer.from(MARKER_VALUE_RAW, "utf8")),
      ]);
    } else {
      await provider.writeObject(name, data, wopts);
    }
  }

  const statObject: (name: string) => Promise<StoredObject | null> = provider.statObject.bind(provider);
  const listObjects: () => Promise<StoredObject[]> = provider.listObjects.bind(provider);
  const objectExists: (name: string) => Promise<boolean> = provider.objectExists.bind(provider);
  const deleteObject: (name: string) => Promise<void> = provider.deleteObject.bind(provider);

  return {
    kind: provider.kind,
    writeObject,
    readObject,
    statObject,
    listObjects,
    objectExists,
    deleteObject,
  };
}
