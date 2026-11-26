import type {
  LocalToolProxy,
  LocalToolRequest,
  WorkspaceApiRequest,
  WorkspaceApiResult,
  WorkspaceApiProxy,
} from "@substrate/contracts/agent-tools/mcp";

import { workspaceRequestTimeoutMs } from "../mcp/request-limits.ts";

/** Local tools answer from main's local store and never wait for an approval. */
const localToolTimeoutMs = 30_000;

/** Main validates the result before it posts this message. */
export type WorkspaceApiResponse = { apiResponse: number } & (
  | { result: WorkspaceApiResult; error?: undefined }
  | { error: string }
);
/** The answer to a local tool call, from main's agent-work handler. */
export type LocalToolResponse = { localResponse: number } & (
  | { result: WorkspaceApiResult; error?: undefined }
  | { error: string }
);

/** Requests the worker sends to main and waits for. */
function outbound<Request>(post: (id: number, request: Request) => void, timeoutMs: number) {
  let nextID = 0;
  const pending = new Map<
    number,
    {
      resolve: (value: WorkspaceApiResult) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  const request = (value: Request) =>
    new Promise<WorkspaceApiResult>((resolve, reject) => {
      const id = ++nextID;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error("Request timed out."));
      }, timeoutMs);
      pending.set(id, { resolve, reject, timer });
      post(id, value);
    });
  return {
    request,
    receive: (id: number, data: { result?: WorkspaceApiResult; error?: string }) => {
      const entry = pending.get(id);
      if (!entry) return;
      pending.delete(id);
      clearTimeout(entry.timer);
      if (data.error !== undefined || !data.result) entry.reject(new Error(data.error));
      else entry.resolve(data.result);
    },
    dispose: () => {
      for (const entry of pending.values()) {
        clearTimeout(entry.timer);
        entry.reject(new Error("Harness shutdown."));
      }
      pending.clear();
    },
  };
}

export function createWorkspaceProxy(
  postMessage: (message: { id: number; api: WorkspaceApiRequest }) => void,
) {
  const proxy = outbound<WorkspaceApiRequest>(
    (id, api) => postMessage({ id, api }),
    workspaceRequestTimeoutMs,
  );
  const request: WorkspaceApiProxy = proxy.request;
  return {
    request,
    receive: (data: WorkspaceApiResponse) => proxy.receive(data.apiResponse, data),
    dispose: proxy.dispose,
  };
}

export function createLocalToolProxy(
  postMessage: (message: { id: number; local: LocalToolRequest }) => void,
) {
  const proxy = outbound<LocalToolRequest>(
    (id, local) => postMessage({ id, local }),
    localToolTimeoutMs,
  );
  const request: LocalToolProxy = proxy.request;
  return {
    request,
    receive: (data: LocalToolResponse) => proxy.receive(data.localResponse, data),
    dispose: proxy.dispose,
  };
}
