import { HarnessError } from "../errors.ts";
import { launch, stopProcess } from "../process.ts";
import { JsonLineRpc } from "./json-rpc.ts";
import type { AdapterContext, NativeAdapter } from "./types.ts";

/* oxlint-disable deslop/no-runtime-typeof, deslop/no-unsafe-dictionary-type, deslop/no-unknown-parameters -- Native app-server notifications and host replies are validated at this protocol boundary. */

interface ThreadOptions {
  threadId?: string;
  excludeTurns?: boolean;
  model?: string;
  cwd: string;
  approvalPolicy: "on-request";
  sandbox: "workspace-write";
}

function hasField<Key extends string>(value: unknown, key: Key): value is Record<Key, unknown> {
  return typeof value === "object" && value !== null && key in value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item: unknown) => typeof item === "string");
}

export async function connectCodex(
  context: AdapterContext,
  resumeId?: string,
): Promise<NativeAdapter> {
  // app-server is the official bidirectional native API. No SDK exec adapter can answer approvals.
  const args = ["app-server"];
  if (context.lease)
    args.push(
      "-c",
      `mcp_servers.startup-os={url=${JSON.stringify(context.lease.url)},bearer_token_env_var="STARTUP_OS_MCP_TOKEN"}`,
    );
  const child = launch(
    context.executable,
    args,
    context.directory,
    context.lease ? { STARTUP_OS_MCP_TOKEN: context.lease.token } : {},
  );
  const approvals = new Map<string, { id: number | string; method: string }>();
  let nativeSessionId = "";
  let turnId: string | undefined;
  let completed: { resolve(): void; reject(error: Error): void } | undefined;
  const rpc = new JsonLineRpc(child, (message) => {
    // SAFETY: known notification discriminants select the native payload shape; authorization still checks the exact connected thread ID.
    const params = (message.params ?? {}) as {
      threadId?: string;
      delta?: string;
      turn?: { id: string; status: string };
      [key: string]: unknown;
    };
    if (params.threadId && params.threadId !== nativeSessionId) return;
    if (message.id !== undefined && message.method) {
      if (
        ![
          "item/commandExecution/requestApproval",
          "item/fileChange/requestApproval",
          "item/tool/requestUserInput",
          "mcpServer/elicitation/request",
        ].includes(message.method)
      ) {
        rpc.send({
          id: message.id,
          error: { code: -32601, message: "Host capability not supported" },
        });
        return;
      }
      const requestId = String(message.id);
      approvals.set(requestId, { id: message.id, method: message.method });
      context.emit({
        type: "request",
        requestId,
        kind: message.method.endsWith("requestApproval") ? "permission" : "input",
        data: params,
      });
    } else if (message.method === "item/agentMessage/delta" && typeof params.delta === "string")
      context.emit({ type: "text", text: params.delta, delta: true });
    else if (message.method === "turn/completed") {
      turnId = undefined;
      let status: "completed" | "interrupted" | "failed" = "failed";
      if (params.turn?.status === "completed") status = "completed";
      else if (params.turn?.status === "interrupted") status = "interrupted";
      context.emit({ type: "turn-completed", status });
      completed?.resolve();
      completed = undefined;
    } else if (message.method)
      context.emit({ type: "activity", name: message.method, data: params });
  });
  child.on("exit", () => {
    completed?.reject(new HarnessError("process-exit", "Codex exited before the turn completed."));
    completed = undefined;
  });
  try {
    await rpc.request("initialize", {
      clientInfo: { name: "startup_os", title: "Startup OS", version: "1.0.0" },
    });
    rpc.send({ method: "initialized", params: {} });
    const params: ThreadOptions = {
      cwd: context.directory,
      approvalPolicy: "on-request",
      sandbox: "workspace-write",
    };
    if (resumeId) {
      params.threadId = resumeId;
      params.excludeTurns = true;
    }
    if (context.model) params.model = context.model;
    const result = await rpc.request<{ thread: { id: string } }>(
      resumeId ? "thread/resume" : "thread/start",
      params,
    );
    nativeSessionId = result.thread.id;
    return {
      nativeSessionId,
      async prompt(text) {
        const done = new Promise<void>((resolve, reject) => {
          completed = { resolve, reject };
        });
        // Attach a handler before starting the request so a process exit cannot cause an unhandled rejection.
        void done.catch(() => {});
        try {
          const result = await rpc.request<{ turn: { id: string } }>("turn/start", {
            threadId: nativeSessionId,
            input: [{ type: "text", text }],
          });
          turnId = result.turn.id;
          await done;
        } finally {
          completed = undefined;
        }
      },
      async interrupt() {
        if (turnId) await rpc.request("turn/interrupt", { threadId: nativeSessionId, turnId });
      },
      async respond(requestId, response) {
        const request = approvals.get(requestId);
        if (!request) throw new HarnessError("unknown-request", "Unknown native request.");
        if (request.method.endsWith("requestApproval")) {
          if (!["accept", "decline", "cancel"].includes(String(response)))
            throw new HarnessError(
              "invalid-response",
              "Codex approval accepts accept, decline, or cancel.",
            );
          rpc.send({ id: request.id, result: { decision: response } });
        } else if (request.method === "item/tool/requestUserInput") {
          if (!hasField(response, "answers") || !isRecord(response.answers))
            throw new HarnessError(
              "invalid-response",
              "Codex user input requires an answers object.",
            );
          for (const answer of Object.values(response.answers))
            if (!hasField(answer, "answers") || !isStringArray(answer.answers))
              throw new HarnessError(
                "invalid-response",
                "Each question requires an array of answer strings.",
              );
          rpc.send({ id: request.id, result: { answers: response.answers } });
        } else {
          if (
            !hasField(response, "action") ||
            !["accept", "decline", "cancel"].includes(String(response.action))
          )
            throw new HarnessError(
              "invalid-response",
              "MCP elicitation requires accept, decline, or cancel.",
            );
          rpc.send({
            id: request.id,
            result: {
              action: response.action,
              content:
                response.action === "accept" && "content" in response ? response.content : null,
            },
          });
        }
        approvals.delete(requestId);
      },
      async disconnect() {
        approvals.clear();
        completed?.reject(new HarnessError("disconnected", "Codex disconnected."));
        await stopProcess(child);
        rpc.close();
      },
    };
  } catch (error) {
    rpc.close();
    throw error;
  }
}
