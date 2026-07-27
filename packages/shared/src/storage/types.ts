export interface StorageProvider {
  upload(key: string, data: Buffer, contentType: string): Promise<string>;
  delete(key: string): Promise<void>;
  getSignedUrl(key: string, expiresIn?: number): Promise<string>;
}
