import { MAX_FILE_BYTES } from "@substrate/contracts/files/input";

import { api, authenticatedFetch } from "@/api/client";
import { uploadFile, type UploadFile } from "@/api/files/uploads";

export type MessageAttachmentTarget = {
  organizationId: string;
  conversationId: string;
  messageId: string;
  attachmentId: string;
};

export function fileProblem(file: Pick<UploadFile, "size">): string | undefined {
  if (!file.size) return "This file is empty or its size is unknown.";
  if (file.size > MAX_FILE_BYTES) return "Files must be 5 MB or smaller.";
  return undefined;
}

export const uploadMessageFile = (file: UploadFile, signal: AbortSignal) =>
  uploadFile(file, signal, "file");

function base64(bytes: Uint8Array) {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(binary);
}

export async function attachmentPreview(query: MessageAttachmentTarget, signal?: AbortSignal) {
  const url = api.files.attachments.messages.preview.$url({ query });
  const response = await authenticatedFetch(url.toString(), { signal });
  if (!response.ok) throw new Error("The preview couldn't be loaded.");
  const bytes = new Uint8Array(await response.arrayBuffer());
  return `data:image/webp;base64,${base64(bytes)}`;
}
