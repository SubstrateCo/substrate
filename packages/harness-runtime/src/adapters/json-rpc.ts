import { HarnessError } from "../errors.ts";
import { jsonValue, type JsonValue } from "../json.ts";
import type { NativeProcess } from "../process.ts";
import { stopProcess } from "../process.ts";
import { z } from "zod";

/** The JSON-RPC envelope. Adapters parse method-specific params and results. */
const rpcMessage = z.object({
  id: z.union([z.number(), z.string()]).optional(),
  method: z.string().optional(),
  params: jsonValue.optional(),
  result: jsonValue.optional(),
  error: z.object({ code: z.number(), message: z.string() }).optional(),
});
export type RpcMessage = z.infer<typeof rpcMessage>;

export class JsonLineRpc {
  private readonly pending = new Map<
    number,
    {
      resolve(value: JsonValue | undefined): void;
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
          message = rpcMessage.parse(JSON.parse(line));
        } catch {
          this.close(new HarnessError("invalid-protocol", "Native harness sent invalid JSON."));
          return;
        }
        // Requests from this client use numeric IDs, so only a numeric ID can answer one.
        const responseId = z.number().safeParse(message.id);
        if (responseId.success && !message.method) {
          const request = this.pending.get(responseId.data);
          if (!request) continue;
          this.pending.delete(responseId.data);
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
  /** Resolves with the raw result. The caller parses it with the schema of the method it called. */
  request(method: string, params: JsonValue): Promise<JsonValue | undefined> {
    if (this.ended)
      return Promise.reject(
        new HarnessError("disconnected", "Native JSON-RPC connection is closed."),
      );
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new HarnessError("request-timeout", "Native JSON-RPC request timed out."));
      }, 30_000);
      this.pending.set(id, { resolve, reject, timer });
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
