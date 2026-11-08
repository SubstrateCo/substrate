export interface ObjectStorage {
  signUpload(
    key: string,
    contentType: string,
    size: number,
  ): Promise<{ url: string; headers: Record<string, string> }>;
  read(key: string, maxBytes: number): Promise<Uint8Array>;
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  putImmutable(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  signDownload(key: string, disposition: string): Promise<string>;
  remove(key: string): Promise<void>;
}
