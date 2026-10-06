export type StorageProviderKind = "local" | "r2" | "b2" | "s3";

export interface StoredObject {
  name: string;
  size: number;
  mtimeMs: number;
}

export interface MediaWriteOptions {
  contentType?: string;
}

export interface StorageProvider {
  readonly kind: StorageProviderKind;
  writeObject(name: string, data: Buffer, opts?: MediaWriteOptions): Promise<void>;
  readObject(name: string): Promise<Buffer | null>;
  statObject(name: string): Promise<StoredObject | null>;
  objectExists(name: string): Promise<boolean>;
  listObjects(): Promise<StoredObject[]>;
  deleteObject(name: string): Promise<void>;
}