import { MAX_ATTACHMENTS } from "@substrate/contracts/files/attachments";
import { MAX_FILE_BYTES } from "@substrate/contracts/files/input";

import { useEffect, useRef, useState } from "react";

import {
  transitionAttachmentUpload,
  type AttachmentUploadDraft,
  type AttachmentUploadEvent,
} from "./attachment-upload-machine";
import { useAttachmentUpload } from "@/queries/attachments/mutations";

export type AttachmentDraft = Omit<AttachmentUploadDraft, "attempt">;

export function useAttachmentUploads(existingCount = 0) {
  const { mutateAsync: upload } = useAttachmentUpload();
  const [items, setItems] = useState<AttachmentUploadDraft[]>([]);
  const current = useRef(items);
  const controllers = useRef(new Map<string, AbortController>());
  const [error, setError] = useState<string | null>(null);
  const change = (next: AttachmentUploadDraft[]) => {
    current.current = next;
    setItems(next);
  };
  useEffect(() => {
    const active = controllers.current;
    return () => {
      for (const controller of active.values()) controller.abort();
    };
  }, []);
  const start = (item: AttachmentUploadDraft) => {
    controllers.current.get(item.id)?.abort();
    const controller = new AbortController();
    controllers.current.set(item.id, controller);
    const update = (event: AttachmentUploadEvent) => {
      if (!controller.signal.aborted && controllers.current.get(item.id) === controller)
        change(
          current.current.map((entry) =>
            entry.id === item.id ? transitionAttachmentUpload(entry, event) : entry,
          ),
        );
    };
    void upload({
      file: item.file,
      signal: controller.signal,
      onProgress: (progress) => update({ type: "progress", attempt: item.attempt, progress }),
    })
      .then((fileId) => update({ type: "complete", attempt: item.attempt, fileId }))
      .catch(() => update({ type: "fail", attempt: item.attempt }))
      .finally(() => {
        if (controllers.current.get(item.id) === controller) controllers.current.delete(item.id);
      });
  };
  const add = (files: File[]) => {
    setError(null);
    if (current.current.length + existingCount + files.length > MAX_ATTACHMENTS) {
      setError("You can attach up to 10 files.");
      return;
    }
    if (files.some((file) => !file.size || file.size > MAX_FILE_BYTES)) {
      setError("Choose files between 1 byte and 5 MiB each.");
      return;
    }
    const added = files.map((file): AttachmentUploadDraft => ({
      id: crypto.randomUUID(),
      file,
      status: "uploading",
      progress: 0,
      attempt: 0,
    }));
    change([...current.current, ...added]);
    added.forEach(start);
  };
  return {
    items,
    error,
    add,
    ready: items.length > 0 && items.every((item) => item.status === "ready"),
    fileIds: items.flatMap((item) => (item.fileId ? [item.fileId] : [])),
    remove(id: string) {
      controllers.current.get(id)?.abort();
      controllers.current.delete(id);
      change(current.current.filter((item) => item.id !== id));
    },
    retry(id: string) {
      const item = current.current.find((entry) => entry.id === id);
      if (!item) return;
      const next = transitionAttachmentUpload(item, { type: "retry" });
      if (next === item) return;
      change(current.current.map((entry) => (entry.id === id ? next : entry)));
      start(next);
    },
    clear() {
      for (const controller of controllers.current.values()) controller.abort();
      controllers.current.clear();
      change([]);
      setError(null);
    },
  };
}
export type AttachmentUploads = ReturnType<typeof useAttachmentUploads>;
