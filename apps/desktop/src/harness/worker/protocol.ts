import type { RuntimeHarnessHost } from "@substrate/harness-runtime";

/* oxlint-disable deslop/no-unknown-returns -- Main parses structured-clone results at the process boundary before exposing domain values. */

type HostMethods = Omit<RuntimeHarnessHost, "subscribe">;
type HarnessWorkerMethod = Exclude<keyof HostMethods, "dispose">;

export type HarnessWorkerRequest = { id: number } & (
  | { method: "initialize"; value: string }
  | {
      [Method in keyof HostMethods]: { method: Method } & (Parameters<
        HostMethods[Method]
      > extends []
        ? { value?: undefined }
        : { value: Parameters<HostMethods[Method]>[0] });
    }[keyof HostMethods]
);

export type HarnessWorkerResult = Awaited<ReturnType<HostMethods[keyof HostMethods]>>;

/** A failed worker request. code is a fixed HarnessError code, never native output or a path. */
export class HarnessWorkerError extends Error {
  readonly code: string;
  constructor(code: string) {
    super("Harness operation failed.");
    this.name = "HarnessWorkerError";
    this.code = code;
  }
}

export interface HarnessWorker {
  /** Main parses worker results at the process boundary. */
  request<Method extends HarnessWorkerMethod>(
    method: Method,
    ...args: Parameters<HostMethods[Method]>
  ): Promise<unknown>;
  dispose(): void;
}
