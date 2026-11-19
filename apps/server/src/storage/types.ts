/** Thrown by `read` when the object does not exist. */
export class ObjectNotFoundError extends Error {
  override name = "ObjectNotFoundError";
}

type DownloadDisposition = { kind: "inline" } | { kind: "attachment"; filename: string };

export interface ObjectStorage {
  signUpload(
    key: string,
    contentType: string,
    size: number,
  ): Promise<{ url: string; headers: Record<string, string> }>;
  read(key: string, maxBytes: number): Promise<Uint8Array>;
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  putImmutable(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  signDownload(key: string, disposition: DownloadDisposition): Promise<string>;
  removeMany(keys: string[]): Promise<string[]>;
}
