import { MAX_FILE_BYTES } from "@substrate/contracts/files/input";

import { authenticatedFetch } from "../client";
import { readResult } from "../result";

export async function fetchPrivateBytes(url: string, signal: AbortSignal, image = false) {
  const response = await authenticatedFetch(url, { signal });
  if (!response.ok) {
    await readResult<never>(Promise.resolve(response));
    throw new Error("The file could not be downloaded.");
  }
  if (image && response.headers.get("content-type")?.split(";")[0] !== "image/webp")
    throw new Error("The server did not return a supported private image.");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > MAX_FILE_BYTES) throw new Error("This file exceeds the download limit.");
  signal.throwIfAborted();
  return bytes;
}
