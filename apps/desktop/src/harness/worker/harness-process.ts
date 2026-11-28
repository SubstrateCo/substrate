import type {
  LocalToolProxy,
  LocalToolRequest,
  WorkspaceApiRequest,
  WorkspaceApiProxy,
} from "@substrate/contracts/agent-tools/mcp";
import type { IpcValue } from "@substrate/contracts/desktop/ipc";
import {
  harnessEventSchema,
  isHarnessErrorCode,
  type HarnessCommand,
  type HarnessEvent,
} from "@substrate/contracts/harness-runtime";

import { createOpenSessions } from "./open-sessions.ts";
import {
  HarnessWorkerError,
  type HarnessWorker,
  type HarnessWorkerCall,
  type HarnessWorkerRequest,
} from "./protocol.ts";
import type { ForkOptions, UtilityProcess } from "electron";
import type { EventEmitter } from "node:events";

const commandTimeoutMs: Record<HarnessCommand["type"], number> = {
  open: 5 * 60_000,
  turn: 60_000,
  steer: 60_000,
  interrupt: 60_000,
  respond: 60_000,
  compact: 30 * 60_000,
  close: 60_000,
};
const requestTimeoutMs = 120_000;

export function createHarnessProcess(
  processes: {
    fork: (
      entry: string,
      args: string[],
      options: ForkOptions,
    ) => Pick<UtilityProcess, "postMessage"> &
      Pick<EventEmitter, "on"> & {
        kill(): void;
      };
  },
  entry: string,
  accountDirectory: string,
  onEvent: (event: HarnessEvent) => void,
  proxy: WorkspaceApiProxy,
  localTools: LocalToolProxy,
  timeouts: { commandMs?: number; requestMs?: number } = {},
): HarnessWorker {
  const env = Object.fromEntries(
    [
      "PATH",
      "Path",
      "PATHEXT",
      "SHELL",
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
  const child = processes.fork(entry, [], {
    serviceName: "Substrate Harness",
    env,
    stdio: "ignore",
  });
  let nextID = 0;
  let disposed = false;
  const open = createOpenSessions();
  const pending = new Map<
    number,
    {
      resolve: (value: IpcValue) => void;
      reject: (reason: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  function stopped() {
    disposed = true;
    for (const request of pending.values()) {
      clearTimeout(request.timer);
      request.reject(new HarnessWorkerError("worker-stopped"));
    }
    pending.clear();
    closeOpenSessions();
  }
  function closeOpenSessions() {
    for (const event of open.exited()) {
      try {
        onEvent(event);
      } catch {}
    }
  }
  function answer<Request>(
    id: number,
    request: Request,
    handler: (request: Request) => ReturnType<WorkspaceApiProxy>,
    key: "apiResponse" | "localResponse",
  ) {
    if (disposed) return;
    void handler(request).then(
      (result) => {
        if (!disposed) child.postMessage({ [key]: id, result });
      },
      () => {
        if (!disposed) child.postMessage({ [key]: id, error: "Request failed." });
      },
    );
  }
  child.on("exit", stopped);
  child.on(
    "message",
    (message: {
      id: number;
      result?: IpcValue;
      error?: string;
      code?: string;
      event?: HarnessEvent;
      api?: WorkspaceApiRequest;
      local?: LocalToolRequest;
    }) => {
      if (message.api) {
        answer(message.id, message.api, proxy, "apiResponse");
        return;
      }
      if (message.local) {
        answer(message.id, message.local, localTools, "localResponse");
        return;
      }
      if (message.event) {
        if (disposed) return;
        const event = harnessEventSchema.safeParse(message.event);
        if (!event.success) {
          child.kill();
          stopped();
          return;
        }
        open.observe(event.data);
        onEvent(event.data);
        return;
      }
      const request = pending.get(message.id);
      if (!request) return;
      pending.delete(message.id);
      clearTimeout(request.timer);
      if (message.error)
        request.reject(
          new HarnessWorkerError(isHarnessErrorCode(message.code) ? message.code : "harness-error"),
        );
      else request.resolve(message.result);
    },
  );
  function send(call: HarnessWorkerCall): Promise<IpcValue> {
    if (disposed) return Promise.reject(new HarnessWorkerError("worker-stopped"));
    const command = call.method === "execute" ? call.value : undefined;
    return new Promise((resolve, reject) => {
      const id = ++nextID;
      const timer = command
        ? setTimeout(() => {
            pending.delete(id);
            reject(new HarnessWorkerError("timeout"));
          }, timeouts.commandMs ?? commandTimeoutMs[command.type])
        : setTimeout(() => {
            child.kill();
            stopped();
          }, timeouts.requestMs ?? requestTimeoutMs);
      pending.set(id, { resolve, reject, timer });
      child.postMessage({ id, ...call } satisfies HarnessWorkerRequest);
    });
  }
  async function request(call: HarnessWorkerCall): Promise<IpcValue> {
    if (call.method !== "execute" || call.value.type !== "open") return send(call);
    const command = call.value;
    open.opening(command);
    try {
      const ref = await send(call);
      open.opened(command.sessionId);
      return ref;
    } catch (error) {
      if (error instanceof HarnessWorkerError && error.code !== "timeout")
        open.openFailed(command.sessionId);
      throw error;
    }
  }
  const ready = send({ method: "initialize", value: accountDirectory });
  void ready.catch(() => {});
  return {
    request: async (method, ...[value]) => {
      await ready;
      // SAFETY: HarnessWorker types value by method; TypeScript cannot correlate the two here.
      return request({ method, value } as HarnessWorkerCall);
    },
    dispose() {
      if (disposed) return;
      const shutdown = send({ method: "dispose" });
      disposed = true;
      closeOpenSessions();
      const deadline = setTimeout(stop, 2000);
      function stop() {
        clearTimeout(deadline);
        child.kill();
        stopped();
      }
      void shutdown.then(stop, stop);
    },
  };
}
