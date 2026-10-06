import { getEnv } from "../../config/env.js";
import { b2ConfigFromEnv, createB2StorageProvider } from "./b2.js";
import { withCompression } from "./compression.js";
import { createLocalStorageProvider } from "./local.js";
import { createS3StorageProvider, s3ConfigFromEnv } from "./s3.js";
import type { StorageProvider } from "./types.js";

const warned = new Set<string>();

export function createStorageProvider(kind: string, root?: string): StorageProvider | null {
  switch (kind) {
    case "local":
      return createLocalStorageProvider(root);
    case "r2":
    case "s3": {
      const config = s3ConfigFromEnv(kind as "s3" | "r2");
      const provider = createS3StorageProvider(config);
      if (!config.bucket) {
        if (!warned.has(kind)) {
          warned.add(kind);
          console.warn(
            `Storage provider "${kind}" selected but S3_BUCKET is not set; uploads will fail until it is configured.`
          );
        }
      }
      return withCompression(provider);
    }
    case "b2": {
      const config = b2ConfigFromEnv();
      if (!config.bucket) {
        if (!warned.has(kind)) {
          warned.add(kind);
          console.warn(
            `Storage provider "b2" selected but B2_BUCKET is not set; uploads will fail until it is configured.`
          );
        }
      }
      return withCompression(createB2StorageProvider(config));
    }
    default: {
      if (!warned.has(kind)) {
        warned.add(kind);
        console.warn(`Unknown storage provider "${kind}"; orphan cleanup will skip it.`);
      }
      return null;
    }
  }
}

export function getStorageProviders(): StorageProvider[] {
  const kind = getEnv().STORAGE_PROVIDER;
  const provider = createStorageProvider(kind);
  return provider ? [provider] : [];
}

let primary: StorageProvider | null = null;

export function getPrimaryStorageProvider(): StorageProvider {
  if (!primary) {
    const env = getEnv();
    const provider = createStorageProvider(env.STORAGE_PROVIDER, env.LOCAL_STORAGE_PATH);
    if (!provider) {
      throw new Error(`Primary storage provider "${env.STORAGE_PROVIDER}" is not available`);
    }
    primary = provider;
  }
  return primary;
}

export function resetPrimaryStorageProviderForTests(): void {
  primary = null;
}

export type { MediaWriteOptions, StorageProvider, StorageProviderKind, StoredObject } from "./types.js";