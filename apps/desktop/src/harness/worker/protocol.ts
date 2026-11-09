import type { HarnessHost } from "@startup-os/contracts/harness";

/* oxlint-disable deslop/no-unknown-returns -- Main parses structured-clone results at the process boundary before exposing domain values. */

type HostMethods = Omit<HarnessHost, "subscribe">;
export type HarnessWorkerMethod = Exclude<keyof HostMethods, "dispose">;

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

export interface HarnessWorker {
  /** Main parses worker results at the process boundary. */
  request<Method extends HarnessWorkerMethod>(
    method: Method,
    ...args: Parameters<HostMethods[Method]>
  ): Promise<unknown>;
  dispose(): void;
}
