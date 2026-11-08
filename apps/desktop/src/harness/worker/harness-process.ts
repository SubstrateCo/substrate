/* oxlint-disable deslop/no-unknown-parameters, deslop/no-unknown-returns -- This transport forwards structured-clone payloads. Main validates requests and parses responses in the controller. */
import type { HarnessEvent } from "@startup-os/contracts/harness";
import type { WorkspaceApiRequest, WorkspaceApiProxy } from "@startup-os/contracts/harness/mcp";

import type { HarnessWorker } from "../controller/harness-controller.ts";
import { utilityProcess } from "electron";

export function createHarnessProcess(
  entry: string,
  accountDirectory: string,
  onEvent: (event: HarnessEvent) => void,
  proxy: WorkspaceApiProxy,
): HarnessWorker {
  // Do not inherit backend credentials, API keys, or Electron launch overrides.
  const env = Object.fromEntries(
    [
      "PATH",
      "Path",
      "SystemRoot",
      "WINDIR",
      "TEMP",
      "TMP",
      "HOME",
      "USERPROFILE",
      "APPDATA",
      "LOCALAPPDATA",
    ].flatMap((key) => (process.env[key] ? [[key, process.env[key]!]] : [])),
  );
  const child = utilityProcess.fork(entry, [], {
    serviceName: "Startup OS Harness",
    env,
    stdio: "ignore",
  });
  let nextID = 0;
  let disposed = false;
  const pending = new Map<
    number,
    {
      resolve: (value: unknown) => void;
      reject: (reason: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  function rejectPending() {
    for (const request of pending.values()) {
      clearTimeout(request.timer);
      request.reject(new Error("Harness process stopped."));
    }
    pending.clear();
  }
  child.on("exit", () => {
    disposed = true;
    rejectPending();
  });
  child.on(
    "message",
    (message: {
      id: number;
      result?: unknown;
      error?: string;
      event?: HarnessEvent;
      api?: WorkspaceApiRequest;
    }) => {
      if (message.api) {
        if (!disposed)
          void proxy(message.api).then(
            (result) => {
              if (!disposed) child.postMessage({ apiResponse: message.id, result });
            },
            () => {
              if (!disposed)
                child.postMessage({ apiResponse: message.id, error: "Workspace request failed." });
            },
          );
        return;
      }
      if (message.event) {
        if (!disposed) onEvent(message.event);
        return;
      }
      const request = pending.get(message.id);
      if (!request) return;
      pending.delete(message.id);
      clearTimeout(request.timer);
      if (message.error) request.reject(new Error("Harness operation failed."));
      else request.resolve(message.result);
    },
  );
  function request(method: string, value?: unknown): Promise<unknown> {
    if (disposed) return Promise.reject(new Error("Harness process stopped."));
    return new Promise((resolve, reject) => {
      const id = ++nextID;
      const timer = setTimeout(() => {
        child.kill();
        disposed = true;
        rejectPending();
      }, 120_000);
      pending.set(id, { resolve, reject, timer });
      child.postMessage({ id, method, value });
    });
  }
  const ready = request("initialize", accountDirectory);
  // Attach a handler immediately; the first request still receives initialization failure.
  void ready.catch(() => {});
  return {
    request: async (method, value) => {
      await ready;
      return request(method, value);
    },
    dispose() {
      if (disposed) return;
      const shutdown = request("dispose");
      disposed = true;
      const deadline = setTimeout(stop, 2000);
      function stop() {
        clearTimeout(deadline);
        child.kill();
        rejectPending();
      }
      void shutdown.then(stop, stop);
    },
  };
}
