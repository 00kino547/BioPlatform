import type { StorageProvider } from "./types.js";

export class LocalStorageProvider implements StorageProvider {
  private basePath: string;

  constructor(basePath: string) {
    this.basePath = basePath;
  }

  async upload(key: string, _data: Buffer, _contentType: string): Promise<string> {
    // Implementation will be added later
    throw new Error(`LocalStorageProvider.upload(${key}) not implemented`);
  }

  async delete(key: string): Promise<void> {
    throw new Error(`LocalStorageProvider.delete(${key}) not implemented`);
  }

  async getSignedUrl(key: string, _expiresIn?: number): Promise<string> {
    throw new Error(`LocalStorageProvider.getSignedUrl(${key}) not implemented`);
  }
}
