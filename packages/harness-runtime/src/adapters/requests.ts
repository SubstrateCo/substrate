import { HarnessError } from "../errors.ts";
import type { JsonValue } from "../json.ts";
import { randomUUID } from "node:crypto";

export class PendingRequests {
  private readonly requests = new Map<
    string,
    {
      resolve(value: JsonValue | undefined): void;
      reject(error: Error): void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();

  request(emit: (id: string) => void, signal?: AbortSignal): Promise<JsonValue | undefined> {
    const id = randomUUID();
    return new Promise((resolve, reject) => {
      const finish = () => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", abort);
        this.requests.delete(id);
      };
      const abort = () => {
        finish();
        reject(new HarnessError("request-cancelled", "Native request was cancelled."));
      };
      const timer = setTimeout(abort, 10 * 60 * 1000);
      this.requests.set(id, {
        resolve: (value) => {
          finish();
          resolve(value);
        },
        reject: (error) => {
          finish();
          reject(error);
        },
        timer,
      });
      signal?.addEventListener("abort", abort, { once: true });
      if (signal?.aborted) abort();
      else emit(id);
    });
  }
  respond(id: string, value: JsonValue | undefined): void {
    const request = this.requests.get(id);
    if (!request)
      throw new HarnessError(
        "unknown-request",
        "Request is absent, expired, or belongs to a different session.",
      );
    request.resolve(value);
  }
  cancel(): void {
    for (const request of this.requests.values())
      request.reject(new HarnessError("disconnected", "Native connection ended."));
    this.requests.clear();
  }
}
