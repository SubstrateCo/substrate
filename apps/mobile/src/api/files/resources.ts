import type { StorageScope } from "@substrate/contracts/files/scope";

export interface PrivateFile {
  uri: string;
  release: () => void;
}

export interface TemporaryFileInput {
  bytes: Uint8Array;
  filename: string;
  mimeType: string;
  scope: StorageScope;
}

export function safeFilename(value: string) {
  const name = value
    .replace(/[^a-zA-Z0-9._ -]/g, "_")
    .replace(/^\.+/, "")
    .slice(-128)
    .trim();
  return name || "download";
}

export function privateScopePath(scope: StorageScope) {
  const encode = (value: string) =>
    Array.from(value, (character) => character.charCodeAt(0).toString(16)).join("-");
  return `${encode(scope.userId)}_${encode(scope.organizationId ?? "account")}`;
}

export async function sharePrivateFile(file: PrivateFile, share: () => Promise<void>) {
  try {
    await share();
  } finally {
    file.release();
  }
}

/** Pending responses and created files are fenced by the same private-state reset. */
export function createPrivateFileManager(
  createFile: (input: TemporaryFileInput) => Promise<PrivateFile>,
) {
  const pending = new Set<AbortController>();
  const resources = new Set<PrivateFile>();
  return {
    async load({
      load,
      signal,
      ...input
    }: Omit<TemporaryFileInput, "bytes"> & {
      load: (signal: AbortSignal) => Promise<Uint8Array>;
      signal?: AbortSignal;
    }): Promise<PrivateFile> {
      const controller = new AbortController();
      const abort = () => controller.abort();
      signal?.addEventListener("abort", abort, { once: true });
      if (signal?.aborted) abort();
      pending.add(controller);
      try {
        controller.signal.throwIfAborted();
        const bytes = await load(controller.signal);
        controller.signal.throwIfAborted();
        const file = await createFile({ ...input, filename: safeFilename(input.filename), bytes });
        if (controller.signal.aborted) {
          file.release();
          controller.signal.throwIfAborted();
        }
        let released = false;
        const resource: PrivateFile = {
          uri: file.uri,
          release() {
            if (released) return;
            released = true;
            resources.delete(resource);
            file.release();
          },
        };
        resources.add(resource);
        return resource;
      } finally {
        pending.delete(controller);
        signal?.removeEventListener("abort", abort);
      }
    },
    clear() {
      for (const controller of pending) controller.abort();
      pending.clear();
      for (const resource of resources) resource.release();
    },
  };
}
