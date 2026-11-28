import type { IpcValue } from "@substrate/contracts/desktop/ipc";
import type { HarnessErrorCode } from "@substrate/contracts/harness-runtime";
import type { RuntimeHarnessHost } from "@substrate/harness-runtime";

type HostMethods = Omit<RuntimeHarnessHost, "subscribe">;
type HarnessWorkerMethod = Exclude<keyof HostMethods, "dispose">;

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

export class HarnessWorkerError extends Error {
  readonly code: HarnessErrorCode;
  constructor(code: HarnessErrorCode) {
    super("Harness operation failed.");
    this.name = "HarnessWorkerError";
    this.code = code;
  }
}

export interface HarnessWorker {
  request<Method extends HarnessWorkerMethod>(
    method: Method,
    ...args: Parameters<HostMethods[Method]>
  ): Promise<IpcValue>;
  dispose(): void;
}
