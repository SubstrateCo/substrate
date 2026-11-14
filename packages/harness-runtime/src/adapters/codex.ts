import type { AdapterCapabilities, TurnResult } from "@substrate/contracts/harness";

import { HarnessError } from "../errors.ts";
import { jsonValue, type JsonValue } from "../json.ts";
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
import { z } from "zod";

/**
 * Codex runs through our handwritten app-server JSON-RPC client; no Codex protocol package is
 * installed, so nothing beyond the methods below is proven:
 * - steer, steerEvidence, compact: no turn/steer or thread/compact/start in this client. Off.
 * - usage: no token usage notification is handled or typed here. Off.
 * - interruptReceipt: turn/interrupt returns no queued-input report. Off.
 * - noAskProfile: unattended turns start with turn/start approvalPolicy "never"
 *   (TurnStartParams.approvalPolicy, app-server-protocol schema v2; sent at codex.ts:228), and
 *   the adapter declines every approval, user-input and elicitation request that still arrives
 *   (codex.ts:143, codex.ts:191). On.
 */
export const codexCapabilities: AdapterCapabilities = {
  steer: false,
  steerEvidence: false,
  compact: false,
  usage: false,
  noAskProfile: true,
  interruptReceipt: false,
};

type ThreadOptions = {
  threadId?: string;
  excludeTurns?: boolean;
  model?: string;
  cwd: string;
  approvalPolicy: "on-request";
  sandbox: "workspace-write";
};

export interface CodexRpc {
  send(message: RpcMessage): void;
  request(method: string, params: JsonValue): Promise<JsonValue | undefined>;
}

const requestMethods = [
  "item/commandExecution/requestApproval",
  "item/fileChange/requestApproval",
  "item/tool/requestUserInput",
  "mcpServer/elicitation/request",
];
/** Item types that are messages, not tool work. */
const messageItems = new Set(["agentMessage", "userMessage", "reasoning"]);

/** Notification fields that route a message to its thread and turn. */
const codexParams = z.object({
  threadId: z.string().optional(),
  turnId: z.string().optional(),
  turn: z.object({ id: z.string().optional(), status: z.string().optional() }).optional(),
  item: jsonValue.optional(),
});

/** A thread item. An item without a string id and type yields no event. */
const codexItem = z.object({
  id: z.string(),
  type: z.string(),
  text: z.string().optional().catch(undefined),
  status: jsonValue.optional(),
  tool: z.string().optional().catch(undefined),
  arguments: jsonValue.optional(),
  command: jsonValue.optional(),
  query: jsonValue.optional(),
});
type CodexItem = z.infer<typeof codexItem>;

const turnStarted = z.object({ turn: z.object({ id: z.string() }) });
const threadOpened = z.object({ thread: z.object({ id: z.string() }) });

const approvalDecision = z.enum(["accept", "decline", "cancel"]);
const userInputReply = z.object({ answers: z.record(z.string(), jsonValue) });
const questionAnswer = z.object({ answers: z.array(z.string()) });
const elicitationReply = z.object({ action: approvalDecision, content: jsonValue.optional() });

/** A readable step label for a Codex tool item. */
function codexItemLabel(item: CodexItem, type: string) {
  if (item.tool !== undefined) return toolLabel(item.tool, toolInput.parse(item.arguments));
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
    const data = message.params ?? {};
    const parsed = codexParams.safeParse(data);
    // Without a readable thread ID the message cannot be proven to belong to this thread.
    if (!parsed.success) {
      if (message.id !== undefined && message.method) this.decline(message.id, message.method);
      return;
    }
    const params = parsed.data;
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
        data,
      });
      return;
    }
    const item = codexItem.safeParse(params.item).data;
    if (message.method === "item/started" && item) {
      if (!messageItems.has(item.type))
        this.context.emit(
          {
            type: "item.started",
            itemId: item.id,
            itemType: item.type,
            title: codexItemLabel(item, item.type),
          },
          scope,
        );
    } else if (message.method === "item/completed" && item) {
      if (item.type === "agentMessage") {
        if (item.text?.trim()) this.context.emit({ type: "text", text: item.text }, scope);
      } else if (!messageItems.has(item.type))
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
          const result = turnStarted.parse(
            await this.rpc.request("turn/start", {
              threadId: this.nativeSessionId,
              input: [{ type: "text", text: input.text }],
              // A turn's approvalPolicy also applies to later turns, so every turn sets its own.
              // The decline handler stays as a second guard for unattended turns.
              approvalPolicy: options.mode === "unattended" ? "never" : "on-request",
            }),
          );
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
          const decision = approvalDecision.safeParse(response);
          if (!decision.success)
            throw new HarnessError(
              "invalid-response",
              "Codex approval accepts accept, decline, or cancel.",
            );
          this.rpc.send({ id: request.id, result: { decision: decision.data } });
        } else if (request.method === "item/tool/requestUserInput") {
          const reply = userInputReply.safeParse(response);
          if (!reply.success)
            throw new HarnessError(
              "invalid-response",
              "Codex user input requires an answers object.",
            );
          for (const answer of Object.values(reply.data.answers))
            if (!questionAnswer.safeParse(answer).success)
              throw new HarnessError(
                "invalid-response",
                "Each question requires an array of answer strings.",
              );
          this.rpc.send({ id: request.id, result: { answers: reply.data.answers } });
        } else {
          const reply = elicitationReply.safeParse(response);
          if (!reply.success)
            throw new HarnessError(
              "invalid-response",
              "MCP elicitation requires accept, decline, or cancel.",
            );
          this.rpc.send({
            id: request.id,
            result: {
              action: reply.data.action,
              content: reply.data.action === "accept" ? (reply.data.content ?? null) : null,
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
    request: (method, params) =>
      rpc
        ? rpc.request(method, params)
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
    const result = threadOpened.parse(
      await rpc.request(resumeId ? "thread/resume" : "thread/start", params),
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
