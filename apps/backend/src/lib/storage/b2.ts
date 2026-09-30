import { createHash } from "crypto";
import { getEnv } from "../../config/env.js";
import type { MediaWriteOptions, StorageProvider, StorageProviderKind, StoredObject } from "./types.js";

const API_VERSION = "v3";

export interface B2StorageConfig {
  kind: "b2";
  applicationKeyId: string;
  applicationKey: string;
  bucket: string;
  prefix?: string;
  apiUrl?: string;
}

interface B2Auth {
  accountId: string;
  authorizationToken: string;
  apiUrl: string;
  downloadUrl: string;
}

interface B2Bucket {
  bucketName: string;
  bucketId: string;
}

interface B2File {
  fileName: string;
  fileId: string;
  contentLength?: number;
  size?: number;
  uploadTimestamp: number;
  action: string;
}

interface B2ListResult {
  files?: B2File[];
  nextFileName?: string;
}

function toErrorMessage(status: number, body: unknown): string {
  const raw = body as { message?: string; code?: string };
  return raw?.message || raw?.code || `HTTP ${status}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// B2 account-level authorization tokens expire after a bounded lifetime
// (default max ~24h). The running server holds assets for days, so we must
// treat auth as a lease: detect auth expiries (via status/message) and
// re-authorize + retry, instead of caching a dead token forever.
function isAuthExpiry(status: number, body: unknown): boolean {
  if (status === 401) return true;
  const message = toErrorMessage(status, body).toLowerCase();
  return (
    message.includes("expired_auth_token") ||
    message.includes("unauthorized") ||
    message.includes("bad_auth_token") ||
    message.includes("invalid_auth_token")
  );
}

// Refresh well before the hard expiry so long-lived processes don't rely on
// error-driven retries for every call (20h < 24h hard limit, with margin).
const B2_AUTH_TTL_MS = 20 * 60 * 60 * 1000;

export class B2StorageProvider implements StorageProvider {
  readonly kind: StorageProviderKind = "b2";

  private readonly keyId: string;
  private readonly applicationKey: string;
  private readonly bucketName: string;
  private readonly prefix: string;
  private readonly apiUrl: string;

  private auth: B2Auth | null = null;
  private authIssuedAt: number = 0;
  private bucketId: string | null = null;
  private bucketBootstrap: Promise<string | null> | null = null;

  constructor(config: B2StorageConfig) {
    this.keyId = config.applicationKeyId?.trim() ?? "";
    this.applicationKey = config.applicationKey?.trim() ?? "";
    this.bucketName = config.bucket?.trim() ?? "";
    this.prefix = (config.prefix ?? "").replace(/^\/+|\/+$/g, "").replace(/\\/g, "/");
    this.apiUrl = (config.apiUrl ?? "https://api.backblazeb2.com").replace(/\/+$/, "");
  }

  private key(name: string): string {
    return this.prefix ? `${this.prefix}/${name}` : name;
  }

  private unkey(key: string): string {
    return this.prefix && key.startsWith(`${this.prefix}/`) ? key.slice(this.prefix.length + 1) : key;
  }

  private basicAuth(): string {
    return `Basic ${Buffer.from(`${this.keyId}:${this.applicationKey}`).toString("base64")}`;
  }

  private async requestJson(url: string, init: RequestInit): Promise<{ status: number; body: unknown }> {
    const response = await globalThis.fetch(url, init);
    const text = await response.text();
    let body: unknown = {};
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    }
    return { status: response.status, body };
  }

  private async authorize(): Promise<B2Auth> {
    if (!this.keyId || !this.applicationKey) {
      throw new Error('Storage provider "b2" requires B2_APPLICATION_KEY_ID and B2_APPLICATION_KEY');
    }
    const { status, body } = await this.requestJson(`${this.apiUrl}/b2api/${API_VERSION}/b2_authorize_account`, {
      method: "GET",
      headers: { Authorization: this.basicAuth() },
    });
    if (status < 200 || status >= 300) {
      throw new Error(`B2 authorize failed: ${toErrorMessage(status, body)}`);
    }
    const data = body as {
      accountId?: string;
      authorizationToken?: string;
      apiUrl?: string;
      downloadUrl?: string;
      apiInfo?: { storageApi?: { apiUrl?: string; downloadUrl?: string } };
    };
    const apiUrl = data.apiInfo?.storageApi?.apiUrl ?? data.apiUrl;
    const downloadUrl = data.apiInfo?.storageApi?.downloadUrl ?? data.downloadUrl;
    if (!data.authorizationToken || !apiUrl || !downloadUrl || !data.accountId) {
      throw new Error("B2 authorize response is missing accountId/authorizationToken/apiUrl/downloadUrl");
    }
    this.auth = {
      accountId: data.accountId,
      authorizationToken: data.authorizationToken,
      apiUrl: apiUrl.replace(/\/+$/, ""),
      downloadUrl: downloadUrl.replace(/\/+$/, ""),
    };
    // Track when the token was issued so `getAuth` can proactively refresh
    // before Backblaze's hard auth-token expiry.
    this.authIssuedAt = Date.now();
    return this.auth;
  }

  private async getAuth(): Promise<B2Auth> {
    if (!this.auth || Date.now() - this.authIssuedAt >= B2_AUTH_TTL_MS) {
      this.auth = null;
      this.auth = await this.authorize();
    }
    return this.auth;
  }

  // Some B2 APIs (upload URL, raw download) are hit outside `apiCall`. These
  // all carry the account auth token, so wrap them with the same
  // re-authorize-and-retry-once behavior to survive token expiry.
  private async withAuthRetry<T>(operation: (auth: B2Auth) => Promise<T>): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const auth = await this.getAuth();
      try {
        return await operation(auth);
      } catch (error) {
        if (attempt === 0 && isAuthExpiry(0, { message: errorMessage(error) })) {
          // Drop the stale token; the next loop iteration re-authorizes.
          this.auth = null;
          lastError = error;
          continue;
        }
        throw error;
      }
    }
    throw lastError;
  }

  private async apiCall<T>(path: string, payload?: unknown): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const auth = await this.getAuth();
      const { status, body } = await this.requestJson(`${auth.apiUrl}/b2api/${API_VERSION}/${path}`, {
        method: "POST",
        headers: {
          Authorization: auth.authorizationToken,
          "Content-Type": "application/json",
        },
        body: payload === undefined ? undefined : JSON.stringify(payload),
      });
      if (status >= 200 && status < 300) return body as T;
      lastError = new Error(`B2 ${path} failed: ${toErrorMessage(status, body)}`);
      if (attempt === 0 && isAuthExpiry(status, body)) {
        // Stale account token after ~24h — re-authorize and retry once.
        this.auth = null;
        continue;
      }
      break;
    }
    throw lastError;
  }

  private async resolveBucketId(): Promise<string | null> {
    if (this.bucketId) return this.bucketId;
    if (!this.bucketBootstrap) {
      // Cache the lookup promise, but reset it on failure so a stale/expired
      // token or transient error doesn't poison every future call.
      this.bucketBootstrap = this.lookupBucket().catch((error) => {
        this.bucketBootstrap = null;
        throw error;
      });
    }
    return this.bucketBootstrap;
  }

  private async lookupBucket(): Promise<string | null> {
    if (!this.bucketName) {
      throw new Error('Storage provider "b2" requires B2_BUCKET');
    }
    const list = await this.apiCall<{ buckets?: B2Bucket[] }>("b2_list_buckets", {
      accountId: (await this.getAuth()).accountId,
    });
    const found = (list.buckets ?? []).find((bucket) => bucket.bucketName === this.bucketName);
    if (found) {
      this.bucketId = found.bucketId;
      return found.bucketId;
    }
    try {
      const created = await this.apiCall<B2Bucket>("b2_create_bucket", {
        accountId: (await this.getAuth()).accountId,
        bucketName: this.bucketName,
        bucketType: "allPrivate",
      });
      this.bucketId = created.bucketId;
      return created.bucketId;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`B2 bucket "${this.bucketName}" not found and auto-create failed: ${message}`);
    }
  }

  async writeObject(name: string, data: Buffer, opts?: MediaWriteOptions): Promise<void> {
    await this.withAuthRetry(async () => {
      const bucketId = await this.resolveBucketId();
      if (!bucketId) {
        throw new Error(`B2 bucket "${this.bucketName}" could not be resolved`);
      }
      const uploadUrl = await this.apiCall<{ uploadUrl?: string; authorizationToken?: string }>("b2_get_upload_url", {
        bucketId,
      });
      if (!uploadUrl.uploadUrl || !uploadUrl.authorizationToken) {
        throw new Error("B2 get_upload_url response is missing uploadUrl/authorizationToken");
      }
      const sha1 = createHash("sha1").update(data).digest("hex");
      const response = await globalThis.fetch(uploadUrl.uploadUrl, {
        method: "POST",
        headers: {
          Authorization: uploadUrl.authorizationToken,
          "X-Bz-File-Name": this.encodePath(this.key(name)),
          "X-Bz-Content-Sha1": sha1,
          "X-Bz-Content-Length": String(data.length),
          "X-Bz-Content-Type": opts?.contentType ?? "application/octet-stream",
          "Content-Type": opts?.contentType ?? "application/octet-stream",
        },
        body: data,
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`B2 upload failed: ${toErrorMessage(response.status, text)}`);
      }
    });
  }

  private encodePath(value: string): string {
    return value.split("/").map(encodeURIComponent).join("/");
  }

  async readObject(name: string): Promise<Buffer | null> {
    return this.withAuthRetry(async (auth) => {
      const response = await globalThis.fetch(
        `${auth.downloadUrl}/file/${this.encodePath(this.bucketName)}/${this.encodePath(this.key(name))}`,
        {
          method: "GET",
          headers: { Authorization: auth.authorizationToken },
        }
      );
      if (response.status === 404) return null;
      if (response.status === 401) {
        // Expired account token — throw so `withAuthRetry` can re-authorize.
        throw new Error(`B2 read failed: ${toErrorMessage(response.status, { code: "expired_auth_token" })}`);
      }
      if (!response.ok) return null;
      return Buffer.from(await response.arrayBuffer());
    });
  }

  async statObject(name: string): Promise<StoredObject | null> {
    const file = await this.findFile(this.key(name));
    if (!file) return null;
    const size = file.contentLength ?? file.size ?? 0;
    return { name, size, mtimeMs: file.uploadTimestamp };
  }

  async objectExists(name: string): Promise<boolean> {
    return (await this.statObject(name)) !== null;
  }

  async listObjects(): Promise<StoredObject[]> {
    const bucketId = await this.resolveBucketId();
    if (!bucketId) return [];
    const objects: StoredObject[] = [];
    let nextFileName: string | undefined;
    const payload: { bucketId: string; prefix?: string; startFileName?: string } = { bucketId };
    if (this.prefix) payload.prefix = this.prefix;
    do {
      if (nextFileName) payload.startFileName = nextFileName;
      const result = await this.apiCall<B2ListResult>("b2_list_file_names", payload);
      for (const file of result.files ?? []) {
        if (file.action !== "upload") continue;
        const name = this.unkey(file.fileName);
        if (!name) continue;
        objects.push({ name, size: file.contentLength ?? file.size ?? 0, mtimeMs: file.uploadTimestamp });
      }
      nextFileName = result.nextFileName;
    } while (nextFileName);
    return objects;
  }

  private async findFile(fileName: string): Promise<B2File | null> {
    const bucketId = await this.resolveBucketId();
    if (!bucketId) return null;
    const list = await this.apiCall<B2ListResult>("b2_list_file_names", {
      bucketId,
      prefix: fileName,
      maxFileCount: 1,
    });
    const exact = (list.files ?? []).find((file) => file.fileName === fileName);
    return exact ?? null;
  }

  async deleteObject(name: string): Promise<void> {
    const fileName = this.key(name);
    const bucketId = await this.resolveBucketId();
    if (!bucketId) return;
    const list = await this.apiCall<B2ListResult>("b2_list_file_names", {
      bucketId,
      prefix: fileName,
      maxFileCount: 1,
    });
    const exact = (list.files ?? []).find((file) => file.fileName === fileName);
    if (!exact) return;
    await this.apiCall("b2_delete_file_version", { fileName: exact.fileName, fileId: exact.fileId });
  }
}

export function createB2StorageProvider(config: B2StorageConfig): StorageProvider {
  return new B2StorageProvider(config);
}

export function b2ConfigFromEnv(): B2StorageConfig {
  const env = getEnv();
  return {
    kind: "b2",
    applicationKeyId: env.B2_APPLICATION_KEY_ID,
    applicationKey: env.B2_APPLICATION_KEY,
    bucket: env.B2_BUCKET,
    prefix: env.B2_PREFIX,
    apiUrl: env.B2_API_URL,
  };
}