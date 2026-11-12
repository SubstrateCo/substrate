import { defineMachine } from "@substrate/contracts/state-machine";

export const attachmentUploadMachine = defineMachine({
  states: ["uploading", "ready", "failed"],
  terminal: ["ready"],
  events: {
    complete: { from: ["uploading"], to: "ready" },
    fail: { from: ["uploading"], to: "failed" },
    retry: { from: ["failed"], to: "uploading" },
  },
});

export interface AttachmentUploadDraft {
  id: string;
  file: File;
  status: (typeof attachmentUploadMachine.states)[number];
  progress: number;
  fileId?: string;
  attempt: number;
}

export type AttachmentUploadEvent =
  | { type: "progress"; attempt: number; progress: number }
  | { type: "complete"; attempt: number; fileId: string }
  | { type: "fail"; attempt: number }
  | { type: "retry" };

export function transitionAttachmentUpload(
  item: AttachmentUploadDraft,
  event: AttachmentUploadEvent,
): AttachmentUploadDraft {
  if (event.type !== "retry" && event.attempt !== item.attempt) return item;
  if (event.type === "progress")
    return item.status === "uploading" ? { ...item, progress: event.progress } : item;
  const status = attachmentUploadMachine.next(item.status, event.type);
  if (!status) return item;
  switch (event.type) {
    case "complete":
      return { ...item, status, fileId: event.fileId, progress: 100 };
    case "fail":
      return { ...item, status };
    case "retry":
      return { ...item, status, progress: 0, attempt: item.attempt + 1 };
  }
}
