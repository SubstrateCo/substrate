import { MAX_ATTACHMENTS } from "@substrate/contracts/files/attachments";

import { useEffect, useRef, useState } from "react";

import { fileProblem, uploadMessageFile } from "../api/files";
import type { UploadFile } from "@/api/files/uploads";

export type AttachmentDraft = {
  key: string;
  file: UploadFile;
  status: "uploading" | "ready" | "failed";
  fileId?: string;
  error?: string;
};

let nextKey = 0;

/** Files picked for a message. Each uploads at once; a failed one can retry or be removed. */
export function useAttachmentUploads() {
  const [items, setItems] = useState<AttachmentDraft[]>([]);
  const controllers = useRef(new Map<string, AbortController>());
  const [limitError, setLimitError] = useState<string>();

  useEffect(() => {
    const active = controllers.current;
    return () => active.forEach((controller) => controller.abort());
  }, []);

  const patch = (key: string, update: Partial<AttachmentDraft>) =>
    setItems((current) =>
      current.map((item) => (item.key === key ? { ...item, ...update } : item)),
    );

  const start = (key: string, file: UploadFile) => {
    const controller = new AbortController();
    controllers.current.set(key, controller);
    patch(key, { status: "uploading", error: undefined });
    uploadMessageFile(file, controller.signal)
      .then((fileId) => patch(key, { status: "ready", fileId }))
      .catch((error: Error) => {
        if (controller.signal.aborted) return;
        patch(key, {
          status: "failed",
          error: error.message || "Upload failed. Try again.",
        });
      })
      .finally(() => controllers.current.delete(key));
  };

  return {
    items,
    limitError,
    fileIds: items.flatMap((item) => (item.fileId ? [item.fileId] : [])),
    ready: items.every((item) => item.status === "ready"),
    add(files: UploadFile[]) {
      const room = MAX_ATTACHMENTS - items.length;
      setLimitError(files.length > room ? `Attach up to ${MAX_ATTACHMENTS} files.` : undefined);
      const added = files.slice(0, Math.max(0, room)).map((file): AttachmentDraft => {
        const problem = fileProblem(file);
        return {
          key: `file-${++nextKey}`,
          file,
          status: problem ? "failed" : "uploading",
          error: problem,
        };
      });
      setItems((current) => [...current, ...added]);
      for (const item of added) if (item.status === "uploading") start(item.key, item.file);
    },
    retry(key: string) {
      const item = items.find((entry) => entry.key === key);
      if (item && !fileProblem(item.file)) start(key, item.file);
    },
    remove(key: string) {
      controllers.current.get(key)?.abort();
      setItems((current) => current.filter((item) => item.key !== key));
      setLimitError(undefined);
    },
    clear() {
      controllers.current.forEach((controller) => controller.abort());
      setItems([]);
      setLimitError(undefined);
    },
  };
}
