import { gzipSync, gunzipSync } from "zlib";
import { getEnv } from "../../config/env.js";
import type { MediaWriteOptions, StorageProvider, StoredObject } from "./types.js";

const MIN_COMPRESSIBLE_BYTES = 1024;
const MARKER_SUFFIX = ".bio-compressed";
const MARKER_VALUE = "bioplatform-gzip-v1";

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
    if (marker && marker.toString("utf8") === MARKER_VALUE) {
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
