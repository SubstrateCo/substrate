import type {
  addTaskAttachments,
  taskAttachmentTarget,
  taskAttachmentRequest,
  messageAttachmentRequest,
} from "@substrate/contracts/files/attachments";

import { api } from "../client";
import { readResult } from "../result";
import type { z } from "zod";

export type TaskAttachmentTarget = z.input<typeof taskAttachmentTarget>;
export const listTaskAttachments = (data: TaskAttachmentTarget, signal?: AbortSignal) =>
  readResult(api.files.attachments.tasks.$get({ query: data }, { init: { signal } }));
export const listTaskSourceAttachments = (data: TaskAttachmentTarget, signal?: AbortSignal) =>
  readResult(api.files.attachments.tasks.source.$get({ query: data }, { init: { signal } }));
export const attachTaskFiles = (data: z.input<typeof addTaskAttachments>) =>
  readResult(api.files.attachments.tasks.$post({ json: data }));
export const removeTaskAttachment = (data: z.input<typeof taskAttachmentRequest>) =>
  readResult(api.files.attachments.tasks.$delete({ json: data }));
export const taskAttachmentUrl = (data: z.input<typeof taskAttachmentRequest>) =>
  api.files.attachments.tasks.content.$path({ query: data });
export const messageAttachmentUrl = (data: z.input<typeof messageAttachmentRequest>) =>
  api.files.attachments.messages.content.$path({ query: data });
export const messageAttachmentPreviewUrl = (data: z.input<typeof messageAttachmentRequest>) =>
  api.files.attachments.messages.preview.$path({ query: data });

export async function uploadAttachment(
  file: File,
  signal: AbortSignal,
  onProgress: (percent: number) => void,
) {
  const ticket = await readResult(
    api.files.uploads.$post(
      {
        json: {
          purpose: "file",
          filename: file.name,
          contentType: file.type || "application/octet-stream",
          size: file.size,
        },
      },
      { init: { signal } },
    ),
  );
  await new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    const abort = () => request.abort();
    request.open("PUT", ticket.uploadUrl);
    for (const [key, value] of Object.entries(ticket.headers)) request.setRequestHeader(key, value);
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    request.onload = () =>
      request.status >= 200 && request.status < 300
        ? resolve()
        : reject(new Error("Upload failed"));
    request.onerror = () => reject(new Error("Upload failed"));
    request.onabort = () => reject(new DOMException("Upload canceled", "AbortError"));
    request.onloadend = () => signal.removeEventListener("abort", abort);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) {
      signal.removeEventListener("abort", abort);
      reject(signal.reason);
      return;
    }
    request.send(file);
  });
  signal.throwIfAborted();
  const completed = await readResult(
    api.files.uploads[":id"].complete.$post(
      { param: { id: ticket.uploadId } },
      { init: { signal } },
    ),
  );
  signal.throwIfAborted();
  return completed.fileId;
}
