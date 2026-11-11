import type { AdapterCapabilities, TurnResult, Usage } from "@substrate/contracts/harness";

import { HarnessError, unsupported } from "../errors.ts";
import { antigravityAcpAvailable, launch, stopProcess } from "../process.ts";
import { PendingRequests } from "./requests.ts";
import type { AdapterContext, NativeAdapter, TurnOptions } from "./types.ts";
import {
  client,
  ndJsonStream,
  PROTOCOL_VERSION,
  type McpServer,
  type PromptResponse,
  type RequestPermissionRequest,
  type RequestPermissionResponse,
  type SessionUpdate,
} from "@agentclientprotocol/sdk";
import { Readable, Writable } from "node:stream";

/* oxlint-disable deslop/no-runtime-typeof -- These checks validate host responses at the ACP I/O boundary. */

/**
 * Evidence from the installed @agentclientprotocol/sdk 2.4.0 (dist/v1/schema/types.gen.d.ts):
 * - usage: session/update "usage_update" carries used and size context tokens (:2374, :2712).
 * - noAskProfile: session/request_permission is answered with a reject option
 *   (PermissionOptionKind :628) or the "cancelled" outcome (:3695).
 * - steer, steerEvidence, compact, interruptReceipt: ACP has session/prompt and session/cancel
 *   only; no queued input, compaction request or cancel receipt. Off.
 */
export const antigravityCapabilities: AdapterCapabilities = {
  steer: false,
  steerEvidence: false,
  compact: false,
  usage: true,
  noAskProfile: true,
  interruptReceipt: false,
};

export interface AcpTransport {
  prompt(text: string): Promise<PromptResponse>;
  cancel(): Promise<void>;
}

interface AcpTurn {
  mode: TurnOptions["mode"];
  usage?: Usage;
}

/** Maps one ACP session onto host turns. */
export class AcpSession {
  private readonly requests = new PendingRequests();
  private turnState: AcpTurn | undefined;
  /** ACP streams message chunks; canonical text events carry whole messages. */
  private text = "";
  private readonly context: AdapterContext;

  constructor(context: AdapterContext) {
    this.context = context;
  }

  private flush() {
    if (this.text.trim()) this.context.emit({ type: "text", text: this.text });
    this.text = "";
  }

  update(update: SessionUpdate): void {
    if (update.sessionUpdate === "agent_message_chunk") {
      if (update.content.type === "text") this.text += update.content.text;
      return;
    }
    if (update.sessionUpdate === "tool_call") {
      this.flush();
      this.context.emit({
        type: "item.started",
        itemId: update.toolCallId,
        itemType: update.kind ?? "tool",
        title: update.title,
      });
      if (update.status === "completed" || update.status === "failed")
        this.context.emit({
          type: "item.completed",
          itemId: update.toolCallId,
          status: update.status,
        });
    } else if (update.sessionUpdate === "tool_call_update") {
      if (update.status === "completed" || update.status === "failed")
        this.context.emit({
          type: "item.completed",
          itemId: update.toolCallId,
          status: update.status,
        });
    } else if (update.sessionUpdate === "usage_update") {
      const usage: Usage = { contextUsed: update.used, contextWindow: update.size };
      if (this.turnState) this.turnState.usage = usage;
      this.context.emit({ type: "usage.updated", usage });
    }
  }

  async permission(
    request: RequestPermissionRequest,
    signal?: AbortSignal,
  ): Promise<RequestPermissionResponse> {
    if (!this.turnState || this.turnState.mode === "unattended") {
      const reject =
        request.options.find((option) => option.kind === "reject_once") ??
        request.options.find((option) => option.kind === "reject_always");
      return reject
        ? { outcome: { outcome: "selected", optionId: reject.optionId } }
        : { outcome: { outcome: "cancelled" } };
    }
    const response = await this.requests.request(
      (requestId) =>
        this.context.emit({ type: "request.opened", kind: "permission", requestId, data: request }),
      signal,
    );
    const optionId = typeof response === "string" ? response : undefined;
    const option = request.options.find((entry) => entry.optionId === optionId);
    if (!option)
      throw new HarnessError("invalid-response", "Choose one of the native permission option IDs.");
    return { outcome: { outcome: "selected", optionId: option.optionId } };
  }

  cancelRequests(): void {
    this.requests.cancel();
  }

  adapter(
    nativeSessionId: string,
    transport: AcpTransport,
    disconnect: () => Promise<void>,
  ): NativeAdapter {
    return {
      capabilities: antigravityCapabilities,
      nativeSessionId,
      turn: async (input, options) => {
        if (this.turnState) throw new HarnessError("turn-active", "A turn is already running.");
        const turn: AcpTurn = { mode: options.mode };
        this.turnState = turn;
        try {
          const response = await transport.prompt(input.text);
          this.flush();
          const result: TurnResult = {
            status: response.stopReason === "cancelled" ? "interrupted" : "completed",
            // session/prompt accepted the whole input.
            consumedInputIds: input.inputIds,
          };
          if (turn.usage) result.usage = turn.usage;
          return result;
        } catch {
          this.flush();
          return { status: "failed", error: "Antigravity turn failed." } satisfies TurnResult;
        } finally {
          this.turnState = undefined;
          this.requests.cancel();
        }
      },
      interrupt: async () => {
        this.requests.cancel();
        if (this.turnState) await transport.cancel();
        return {};
      },
      respond: async (id, response) => {
        this.requests.respond(id, response);
      },
      disconnect: async () => {
        this.requests.cancel();
        await disconnect();
      },
    };
  }
}

export async function connectAntigravity(
  context: AdapterContext,
  resumeId?: string,
): Promise<NativeAdapter> {
  if (!(await antigravityAcpAvailable(context.executable)))
    unsupported(
      "Installed Antigravity CLI lacks agy acp --process-per-session. Update agy to an ACP-capable release; no print-mode fallback is used.",
    );
  const child = launch(context.executable, ["acp", "--process-per-session"], context.directory);
  const session = new AcpSession(context);
  let nativeSessionId = resumeId ?? "";
  const app = client()
    .onNotification("session/update", ({ params: notification }) => {
      if (notification.sessionId === nativeSessionId) session.update(notification.update);
    })
    .onRequest("session/request_permission", async ({ params: request, signal }) => {
      if (request.sessionId !== nativeSessionId) return { outcome: { outcome: "cancelled" } };
      return session.permission(request, signal);
    });
  // SAFETY: piped Node stdout emits Buffer (a Uint8Array); Node and DOM stream types differ only in ambient declarations here.
  const connection = app.connect(
    ndJsonStream(
      Writable.toWeb(child.stdin),
      Readable.toWeb(child.stdout) as ReadableStream<Uint8Array>,
    ),
  );
  const failed = (error: Error) => {
    session.cancelRequests();
    connection.close(error);
  };
  child.on("error", (error) =>
    failed(new HarnessError("process-spawn", "Cannot start agy ACP.", { cause: error })),
  );
  child.on("exit", (code) =>
    failed(new HarnessError("process-exit", `agy ACP exited with code ${code}.`)),
  );
  child.stderr.resume();
  try {
    const initialized = await connection.agent.request(
      "initialize",
      {
        protocolVersion: PROTOCOL_VERSION,
        clientCapabilities: {},
        clientInfo: { name: "substrate", version: "1.0.0" },
      },
      { cancellationSignal: AbortSignal.timeout(30_000), stopWaitingOnCancel: true },
    );
    const mcpServers: McpServer[] = context.lease
      ? [
          {
            type: "http",
            name: "substrate",
            url: context.lease.url,
            headers: [{ name: "Authorization", value: `Bearer ${context.lease.token}` }],
          },
        ]
      : [];
    if (context.lease && !initialized.agentCapabilities?.mcpCapabilities?.http)
      unsupported("Installed agy does not advertise ACP HTTP MCP support.");
    if (resumeId) {
      if (!initialized.agentCapabilities?.loadSession)
        unsupported("Installed agy cannot load native sessions.");
      await connection.agent.request(
        "session/load",
        { sessionId: resumeId, cwd: context.directory, mcpServers },
        { cancellationSignal: AbortSignal.timeout(30_000), stopWaitingOnCancel: true },
      );
    } else {
      const created = await connection.agent.request(
        "session/new",
        { cwd: context.directory, mcpServers },
        { cancellationSignal: AbortSignal.timeout(30_000), stopWaitingOnCancel: true },
      );
      nativeSessionId = created.sessionId;
    }
    if (context.model)
      await connection.agent.request(
        "session/set_config_option",
        { sessionId: nativeSessionId, configId: "model", value: context.model },
        { cancellationSignal: AbortSignal.timeout(30_000), stopWaitingOnCancel: true },
      );
    return session.adapter(
      nativeSessionId,
      {
        prompt: (text) =>
          connection.agent.request("session/prompt", {
            sessionId: nativeSessionId,
            prompt: [{ type: "text", text }],
          }),
        cancel: () => connection.agent.notify("session/cancel", { sessionId: nativeSessionId }),
      },
      async () => {
        connection.close();
        await stopProcess(child);
      },
    );
  } catch (error) {
    session.cancelRequests();
    connection.close();
    await stopProcess(child);
    throw error;
  }
}
