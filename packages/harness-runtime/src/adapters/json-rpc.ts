import { HarnessError } from "../errors.ts";
import type { NativeProcess } from "../process.ts";
import { stopProcess } from "../process.ts";

/* oxlint-disable deslop/no-unknown-parameters, deslop/no-runtime-typeof -- This module is the native JSON-RPC framing boundary; method-specific payloads are validated by its owning adapter. */

export type RpcMessage = {
  id?: number | string;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code: number; message: string };
};

export class JsonLineRpc {
  private readonly pending = new Map<
    number,
    {
      resolve(value: unknown): void;
      reject(error: Error): void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  private sequence = 0;
  private buffer = "";
  private bufferBytes = 0;
  private ended = false;
  private readonly child: NativeProcess;
  private readonly onMessage: (message: RpcMessage) => void;

  constructor(child: NativeProcess, onMessage: (message: RpcMessage) => void) {
    this.child = child;
    this.onMessage = onMessage;
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      // The buffer held no newline before this chunk, so the scan starts at the chunk.
      let scanFrom = this.buffer.length;
      this.buffer += chunk;
      this.bufferBytes += Buffer.byteLength(chunk);
      if (this.bufferBytes > 4 * 1024 * 1024) {
        this.close(
          new HarnessError("protocol-limit", "Native JSON-RPC message exceeded the size limit."),
        );
        return;
      }
      let newline: number;
      while ((newline = this.buffer.indexOf("\n", scanFrom)) >= 0) {
        const line = this.buffer.slice(0, newline);
        this.buffer = this.buffer.slice(newline + 1);
        scanFrom = 0;
        if (!line.trim()) continue;
        let message: RpcMessage;
        try {
          const decoded: unknown = JSON.parse(line);
          if (!decoded || typeof decoded !== "object" || Array.isArray(decoded))
            throw new Error("Invalid envelope");
          // SAFETY: only envelope discriminants are consumed here; adapter-specific params remain unknown until validated there.
          message = decoded as RpcMessage;
          if (
            (message.id !== undefined &&
              typeof message.id !== "string" &&
              typeof message.id !== "number") ||
            (message.method !== undefined && typeof message.method !== "string")
          )
            throw new Error("Invalid envelope");
        } catch {
          this.close(new HarnessError("invalid-protocol", "Native harness sent invalid JSON."));
          return;
        }
        if (typeof message.id === "number" && !message.method) {
          const request = this.pending.get(message.id);
          if (!request) continue;
          this.pending.delete(message.id);
          clearTimeout(request.timer);
          if (message.error)
            request.reject(
              new HarnessError("native-request", `Native request failed (${message.error.code}).`),
            );
          else request.resolve(message.result);
        } else this.onMessage(message);
      }
      // After a line was taken, what remains is the tail of this chunk.
      if (scanFrom === 0) this.bufferBytes = Buffer.byteLength(this.buffer);
    });
    child.stderr.resume();
    child.on("error", (error) =>
      this.close(
        new HarnessError("process-spawn", "Native process could not start.", { cause: error }),
      ),
    );
    child.on("exit", (code) =>
      this.close(new HarnessError("process-exit", `Native process exited with code ${code}.`)),
    );
    child.stdin.on("error", () =>
      this.close(new HarnessError("process-write", "Native process input closed.")),
    );
  }
  send(message: RpcMessage): void {
    if (this.ended) throw new HarnessError("disconnected", "Native JSON-RPC connection is closed.");
    this.child.stdin.write(JSON.stringify(message) + "\n");
  }
  request<T>(method: string, params: unknown): Promise<T> {
    if (this.ended)
      return Promise.reject(
        new HarnessError("disconnected", "Native JSON-RPC connection is closed."),
      );
    const id = ++this.sequence;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new HarnessError("request-timeout", "Native JSON-RPC request timed out."));
      }, 30_000);
      // SAFETY: the adapter supplies the response type for the exact method it requested; untrusted nested data is not used for host authorization.
      this.pending.set(id, { resolve: (value) => resolve(value as T), reject, timer });
      this.send({ id, method, params });
    });
  }
  close(error: Error = new HarnessError("disconnected", "Native connection closed.")): void {
    if (this.ended) return;
    this.ended = true;
    for (const request of this.pending.values()) {
      clearTimeout(request.timer);
      request.reject(error);
    }
    this.pending.clear();
    void stopProcess(this.child);
  }
}
