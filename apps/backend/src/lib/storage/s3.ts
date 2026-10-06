import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { getEnv } from "../../config/env.js";
import type { MediaWriteOptions, StorageProvider, StorageProviderKind, StoredObject } from "./types.js";

export interface S3StorageConfig {
  kind: "s3" | "r2";
  endpoint?: string;
  region?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  bucket: string;
  prefix?: string;
  forcePathStyle?: boolean;
}

function createS3Client(config: S3StorageConfig): S3Client {
  return new S3Client({
    region: config.region?.trim() || "auto",
    endpoint: config.endpoint?.trim() || undefined,
    forcePathStyle: config.forcePathStyle ?? false,
    credentials:
      config.accessKeyId?.trim()
        ? { accessKeyId: config.accessKeyId.trim(), secretAccessKey: config.secretAccessKey?.trim() ?? "" }
        : undefined,
  });
}

export class S3StorageProvider implements StorageProvider {
  readonly kind: StorageProviderKind;

  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly prefix: string;
  private bootstrap: Promise<void> | null = null;

  constructor(config: S3StorageConfig) {
    this.kind = config.kind;
    this.bucket = config.bucket;
    this.prefix = (config.prefix ?? "").replace(/^\/+|\/+$/g, "").replace(/\\/g, "/");
    this.client = createS3Client(config);
  }

  private key(name: string): string {
    return this.prefix ? `${this.prefix}/${name}` : name;
  }

  private unkey(key: string): string {
    return this.prefix && key.startsWith(`${this.prefix}/`) ? key.slice(this.prefix.length + 1) : key;
  }

  private async ensureBucket(): Promise<void> {
    if (!this.bootstrap) {
      this.bootstrap = (async () => {
        if (!this.bucket) {
          throw new Error(`Storage provider "${this.kind}" requires S3_BUCKET to be configured`);
        }
        try {
          await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
        } catch (error) {
          try {
            await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
          } catch (createError) {
            const message = createError instanceof Error ? createError.message : String(createError);
            const status = (createError as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
            if (status !== 409 && message.includes("already exists")) {
              void error;
              return;
            }
            throw createError;
          }
        }
      })();
    }
    return this.bootstrap;
  }

  async writeObject(name: string, data: Buffer, opts?: MediaWriteOptions): Promise<void> {
    await this.ensureBucket();
    const upload = new Upload({
      client: this.client,
      params: {
        Bucket: this.bucket,
        Key: this.key(name),
        Body: data,
        ContentType: opts?.contentType,
      },
      partSize: 5 * 1024 * 1024,
      queueSize: 4,
    });
    await upload.done();
  }

  async readObject(name: string): Promise<Buffer | null> {
    try {
      const response = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: this.key(name) }));
      const body = response.Body;
      if (!body) return null;
      const bytes = await body.transformToByteArray();
      return Buffer.from(bytes);
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  async statObject(name: string): Promise<StoredObject | null> {
    try {
      const response = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: this.key(name) }));
      return {
        name,
        size: response.ContentLength ?? 0,
        mtimeMs: response.LastModified?.getTime() ?? Date.now(),
      };
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  async objectExists(name: string): Promise<boolean> {
    const stat = await this.statObject(name);
    return stat !== null;
  }

  async listObjects(): Promise<StoredObject[]> {
    const objects: StoredObject[] = [];
    let continuationToken: string | undefined;
    do {
      const response = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: this.prefix || undefined,
          ContinuationToken: continuationToken,
        })
      );
      for (const object of response.Contents ?? []) {
        const key = object.Key ?? "";
        if (!key || (this.prefix && key === this.prefix)) continue;
        objects.push({
          name: this.unkey(key),
          size: object.Size ?? 0,
          mtimeMs: object.LastModified?.getTime() ?? Date.now(),
        });
      }
      continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
    } while (continuationToken);
    return objects;
  }

  async deleteObject(name: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: this.key(name) }));
  }
}

function isNotFound(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const status = (error as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
  const name = (error as { name?: string })?.name ?? "";
  return name === "NotFound" || status === 404 || /NoSuchKey|NoSuchBucket|404/i.test(message);
}

export function createS3StorageProvider(config: S3StorageConfig): StorageProvider {
  return new S3StorageProvider(config);
}

export function s3ConfigFromEnv(kind: "s3" | "r2"): S3StorageConfig {
  const env = getEnv();
  return {
    kind,
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION,
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    bucket: env.S3_BUCKET,
    prefix: env.S3_PREFIX,
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
  };
}