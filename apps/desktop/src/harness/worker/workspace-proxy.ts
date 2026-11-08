import type {
  WorkspaceApiRequest,
  WorkspaceApiResult,
  WorkspaceApiProxy,
} from "@startup-os/contracts/harness/mcp";

/** Main validates the result before it posts this message. */
export type WorkspaceApiResponse = { apiResponse: number } & (
  | { result: WorkspaceApiResult; error?: undefined }
  | { error: string }
);

export function createWorkspaceProxy(
  postMessage: (message: { id: number; api: WorkspaceApiRequest }) => void,
) {
  let nextApiID = 0;
  const pendingApi = new Map<
    number,
    {
      resolve: (value: WorkspaceApiResult) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  const request: WorkspaceApiProxy = (request) =>
    new Promise((resolve, reject) => {
      const id = ++nextApiID;
      const timer = setTimeout(() => {
        pendingApi.delete(id);
        reject(new Error("Workspace request timed out."));
      }, 30_000);
      pendingApi.set(id, { resolve, reject, timer });
      postMessage({ id, api: request });
    });

  return {
    request,
    receive(data: WorkspaceApiResponse) {
      const pending = pendingApi.get(data.apiResponse);
      if (!pending) return;
      pendingApi.delete(data.apiResponse);
      clearTimeout(pending.timer);
      if (data.error !== undefined) pending.reject(new Error(data.error));
      else pending.resolve(data.result);
    },
    dispose() {
      for (const pending of pendingApi.values()) {
        clearTimeout(pending.timer);
        pending.reject(new Error("Harness shutdown."));
      }
      pendingApi.clear();
    },
  };
}
