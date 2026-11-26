import type { IpcValue } from "@substrate/contracts/desktop/ipc";
import type { HarnessErrorCode } from "@substrate/contracts/harness-runtime";
import type { RuntimeHarnessHost } from "@substrate/harness-runtime";

type HostMethods = Omit<RuntimeHarnessHost, "subscribe">;
type HarnessWorkerMethod = Exclude<keyof HostMethods, "dispose">;

/** One worker method with its value, as main sends it. */
export type HarnessWorkerCall =
  | { method: "initialize"; value: string }
  | {
      [Method in keyof HostMethods]: { method: Method } & (Parameters<
        HostMethods[Method]
      > extends []
        ? { value?: undefined }
        : { value: Parameters<HostMethods[Method]>[0] });
    }[keyof HostMethods];

export type HarnessWorkerRequest = { id: number } & HarnessWorkerCall;

export type HarnessWorkerResult = Awaited<ReturnType<HostMethods[keyof HostMethods]>>;

/** A failed worker request. code is a fixed HarnessError code, never native output or a path. */
export class HarnessWorkerError extends Error {
  readonly code: HarnessErrorCode;
  constructor(code: HarnessErrorCode) {
    super("Harness operation failed.");
    this.name = "HarnessWorkerError";
    this.code = code;
  }
}

export interface HarnessWorker {
  /** Main parses worker results at the process boundary; they arrive as structured-clone data. */
  request<Method extends HarnessWorkerMethod>(
    method: Method,
    ...args: Parameters<HostMethods[Method]>
  ): Promise<IpcValue>;
  dispose(): void;
}
