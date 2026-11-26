import { MAX_FILE_BYTES } from "@substrate/contracts/files/input";
import type { FileContentReader } from "@substrate/database/mcp";

import { ObjectNotFoundError, type ObjectStorage } from "../../storage/types";
import type { ImageCodec } from "./image-codec";
import { previewAttachmentImage } from "./image-policy";

/** Stored bytes for the agent file tools. A missing object or an undecodable image reads as null. */
export function storageFileReader(storage: ObjectStorage, images: ImageCodec): FileContentReader {
  async function bytes(objectKey: string) {
    try {
      return await storage.read(objectKey, MAX_FILE_BYTES);
    } catch (error) {
      if (error instanceof ObjectNotFoundError) return null;
      throw error;
    }
  }
  return {
    bytes,
    async preview(objectKey) {
      const source = await bytes(objectKey);
      if (!source) return null;
      return previewAttachmentImage(images, source);
    },
  };
}
