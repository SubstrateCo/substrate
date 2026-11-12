import type { AdapterCapabilities, TurnResult } from "@substrate/contracts/harness";

import { HarnessError } from "../errors.ts";
import { launch, stopProcess } from "../process.ts";
import { JsonLineRpc, type RpcMessage } from "./json-rpc.ts";
import { toolInput, toolLabel } from "./tool-label.ts";
import {
  unattendedDenial,
  type AdapterContext,
  type EventScope,
  type NativeAdapter,
  type TurnOptions,
} from "./types.ts";

/* oxlint-disable deslop/no-runtime-typeof, deslop/no-unsafe-dictionary-type, deslop/no-unknown-parameters -- Native app-server notifications and host replies are validated at this protocol boundary. */

/**
 * Codex runs through our handwritten app-server JSON-RPC client; no Codex protocol package is
 * installed, so nothing beyond the methods below is proven:
 * - steer, steerEvidence, compact: no turn/steer or thread/compact/start in this client. Off.
 * - usage: no token usage notification is handled or typed here. Off.
 * - interruptReceipt: turn/interrupt returns no queued-input report. Off.
 * - noAskProfile: unattended turns start with turn/start approvalPolicy "never"
 *   (TurnStartParams.approvalPolicy, app-server-protocol schema v2), and the adapter declines
 *   every approval, user-input and elicitation request that still arrives. On.
 */
export const codexCapabilities: AdapterCapabilities = {
  steer: false,
  steerEvidence: false,
  compact: false,
  usage: false,
  noAskProfile: true,
  interruptReceipt: false,
};

interface ThreadOptions {
  threadId?: string;
  excludeTurns?: boolean;
  model?: string;
  cwd: string;
  approvalPolicy: "on-request";
  sandbox: "workspace-write";
}

export interface CodexRpc {
  send(message: RpcMessage): void;
  request<T>(method: string, params: unknown): Promise<T>;
}

const requestMethods = [
  "item/commandExecution/requestApproval",
  "item/fileChange/requestApproval",
  "item/tool/requestUserInput",
  "mcpServer/elicitation/request",
];
/** Item types that are messages, not tool work. */
const messageItems = new Set(["agentMessage", "userMessage", "reasoning"]);

function hasField<Key extends string>(value: unknown, key: Key): value is Record<Key, unknown> {
  return typeof value === "object" && value !== null && key in value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item: unknown) => typeof item === "string");
}

interface CodexItem {
  id?: unknown;
  type?: unknown;
  text?: unknown;
  status?: unknown;
  tool?: unknown;
  arguments?: unknown;
  command?: unknown;
  query?: unknown;
}

/** A readable step label for a Codex tool item. */
function codexItemLabel(item: CodexItem, type: string) {
  if (typeof item.tool === "string") return toolLabel(item.tool, toolInput.parse(item.arguments));
  if (type === "commandExecution")
    return toolLabel("shell", toolInput.parse({ command: item.command }));
  if (type === "webSearch") return toolLabel("websearch", toolInput.parse({ query: item.query }));
  if (type === "fileChange") return "Edit files";
  return toolLabel(type);
}

interface LiveTurn {
  nativeTurnId?: string;
  inputIds: string[];
  mode: TurnOptions["mode"];
  resolve(result: TurnResult): void;
}

/** Maps one Codex thread onto host turns. */
export class CodexSession {
  nativeSessionId = "";
  private readonly approvals = new Map<string, { id: number | string; method: string }>();
  private turnState: LiveTurn | undefined;
  private readonly context: AdapterContext;
  private readonly rpc: CodexRpc;

  constructor(context: AdapterContext, rpc: CodexRpc) {
    this.context = context;
    this.rpc = rpc;
  }

  handle(message: RpcMessage): void {
    // SAFETY: known notification discriminants select the native payload shape; authorization still checks the exact connected thread ID.
    const params = (message.params ?? {}) as {
      threadId?: string;
      turnId?: string;
      turn?: { id: string; status: string };
      item?: CodexItem;
      [key: string]: unknown;
    };
    if (params.threadId && params.threadId !== this.nativeSessionId) return;
    const turn = this.turnState;
    const nativeTurnId = params.turnId ?? params.turn?.id;
    const scope: EventScope =
      turn && (!nativeTurnId || !turn.nativeTurnId || nativeTurnId === turn.nativeTurnId)
        ? "turn"
        : "session";
    if (message.id !== undefined && message.method) {
      if (!requestMethods.includes(message.method)) {
        this.rpc.send({
          id: message.id,
          error: { code: -32601, message: "Host capability not supported" },
        });
        return;
      }
      if (!turn || turn.mode === "unattended" || scope === "session") {
        this.decline(message.id, message.method);
        return;
      }
      const requestId = String(message.id);
      this.approvals.set(requestId, { id: message.id, method: message.method });
      this.context.emit({
        type: "request.opened",
        requestId,
        kind: message.method.endsWith("requestApproval") ? "permission" : "input",
        data: params,
      });
      return;
    }
    const item = params.item;
    if (message.method === "item/started" && item && typeof item.id === "string") {
      if (typeof item.type === "string" && !messageItems.has(item.type))
        this.context.emit(
          {
            type: "item.started",
            itemId: item.id,
            itemType: item.type,
            title: codexItemLabel(item, item.type),
          },
          scope,
        );
    } else if (message.method === "item/completed" && item && typeof item.id === "string") {
      if (item.type === "agentMessage") {
        if (typeof item.text === "string" && item.text.trim())
          this.context.emit({ type: "text", text: item.text }, scope);
      } else if (typeof item.type === "string" && !messageItems.has(item.type))
        this.context.emit(
          {
            type: "item.completed",
            itemId: item.id,
            status: item.status === "failed" || item.status === "declined" ? "failed" : "completed",
          },
          scope,
        );
    } else if (message.method === "turn/completed" && scope === "turn" && turn) {
      let status: TurnResult["status"] = "failed";
      if (params.turn?.status === "completed") status = "completed";
      else if (params.turn?.status === "interrupted") status = "interrupted";
      // turn/start accepted the whole input, so it was consumed even when the turn failed.
      this.finish({ status, consumedInputIds: turn.inputIds });
    }
  }

  /** The no-ask profile: refuse a native prompt without asking anyone. */
  private decline(id: number | string, method: string) {
    if (method.endsWith("requestApproval")) this.rpc.send({ id, result: { decision: "decline" } });
    else if (method === "mcpServer/elicitation/request")
      this.rpc.send({ id, result: { action: "decline", content: null } });
    else
      this.rpc.send({
        id,
        error: { code: -32000, message: unattendedDenial },
      });
  }

  finish(result: TurnResult): void {
    const turn = this.turnState;
    if (!turn) return;
    this.turnState = undefined;
    turn.resolve(result);
  }

  adapter(disconnect: () => Promise<void>): NativeAdapter {
    return {
      capabilities: codexCapabilities,
      nativeSessionId: this.nativeSessionId,
      turn: async (input, options) => {
        if (this.turnState) throw new HarnessError("turn-active", "A turn is already running.");
        let resolve: (result: TurnResult) => void = () => {};
        const done = new Promise<TurnResult>((settle) => {
          resolve = settle;
        });
        const turn: LiveTurn = { inputIds: input.inputIds, mode: options.mode, resolve };
        this.turnState = turn;
        try {
          const result = await this.rpc.request<{ turn: { id: string } }>("turn/start", {
            threadId: this.nativeSessionId,
            input: [{ type: "text", text: input.text }],
            // A turn's approvalPolicy also applies to later turns, so every turn sets its own.
            // The decline handler stays as a second guard for unattended turns.
            approvalPolicy: options.mode === "unattended" ? "never" : "on-request",
          });
          turn.nativeTurnId = result.turn.id;
        } catch {
          this.finish({ status: "failed", error: "Codex rejected the turn input." });
        }
        return done;
      },
      interrupt: async () => {
        const id = this.turnState?.nativeTurnId;
        if (id)
          await this.rpc.request("turn/interrupt", { threadId: this.nativeSessionId, turnId: id });
        return {};
      },
      respond: async (requestId, response) => {
        const request = this.approvals.get(requestId);
        if (!request) throw new HarnessError("unknown-request", "Unknown native request.");
        if (request.method.endsWith("requestApproval")) {
          if (!["accept", "decline", "cancel"].includes(String(response)))
            throw new HarnessError(
              "invalid-response",
              "Codex approval accepts accept, decline, or cancel.",
            );
          this.rpc.send({ id: request.id, result: { decision: response } });
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
          this.rpc.send({ id: request.id, result: { answers: response.answers } });
        } else {
          if (
            !hasField(response, "action") ||
            !["accept", "decline", "cancel"].includes(String(response.action))
          )
            throw new HarnessError(
              "invalid-response",
              "MCP elicitation requires accept, decline, or cancel.",
            );
          this.rpc.send({
            id: request.id,
            result: {
              action: response.action,
              content:
                response.action === "accept" && "content" in response ? response.content : null,
            },
          });
        }
        this.approvals.delete(requestId);
      },
      disconnect: async () => {
        this.approvals.clear();
        this.finish({ status: "failed", error: "Codex disconnected." });
        await disconnect();
      },
    };
  }
}

export function codexArgs(context: AdapterContext): string[] {
  const args = ["app-server"];
  // Codex defers MCP tools when the model supports search; the old feature switches are no-ops.
  // openai/codex@16e27626, codex-rs/features/src/lib.rs:305-308. Do not send Responses API flags.
  // required keeps the managed catalog available for discovery; see /codex/extend/mcp#other-configuration-options.
  if (context.lease)
    args.push(
      "-c",
      `mcp_servers.substrate={url=${JSON.stringify(context.lease.url)},bearer_token_env_var="SUBSTRATE_MCP_TOKEN",required=true}`,
    );
  return args;
}

export async function connectCodex(
  context: AdapterContext,
  resumeId?: string,
): Promise<NativeAdapter> {
  // app-server is the official bidirectional native API. No SDK exec adapter can answer approvals.
  const child = launch(
    context.executable,
    codexArgs(context),
    context.directory,
    context.lease ? { SUBSTRATE_MCP_TOKEN: context.lease.token } : {},
  );
  let rpc: JsonLineRpc | undefined;
  const session = new CodexSession(context, {
    send: (message) => rpc?.send(message),
    request: <T>(method: string, params: unknown) =>
      rpc
        ? rpc.request<T>(method, params)
        : Promise.reject(new HarnessError("disconnected", "Codex is not connected.")),
  });
  rpc = new JsonLineRpc(child, (message) => session.handle(message));
  child.on("exit", () =>
    session.finish({ status: "failed", error: "Codex exited before the turn completed." }),
  );
  try {
    await rpc.request("initialize", {
      clientInfo: { name: "substrate", title: "Substrate", version: "1.0.0" },
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
    session.nativeSessionId = result.thread.id;
    const connection = rpc;
    return session.adapter(async () => {
      await stopProcess(child);
      connection.close();
    });
  } catch (error) {
    rpc.close();
    throw error;
  }
}
