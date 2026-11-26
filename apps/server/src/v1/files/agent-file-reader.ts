import { MAX_FILE_BYTES } from "@substrate/contracts/files/input";
import type { FileContentReader } from "@substrate/database/mcp";

import { ServiceError } from "../../shared/service-result";
import { ObjectNotFoundError, type ObjectStorage } from "../../storage/types";
import { previewAttachmentImage } from "./attachment-image";

/** Stored bytes for the agent file tools. A missing object or an undecodable image reads as null. */
export function storageFileReader(storage: ObjectStorage): FileContentReader {
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
      try {
        return await previewAttachmentImage(source);
      } catch (error) {
        if (error instanceof ServiceError) return null;
        throw error;
      }
    },
  };
}
