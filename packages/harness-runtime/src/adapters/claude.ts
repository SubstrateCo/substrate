import type {
  AdapterCapabilities,
  InterruptReceipt,
  TurnResult,
  Usage,
} from "@substrate/contracts/harness";

import { HarnessError } from "../errors.ts";
import { InputQueue } from "./input-queue.ts";
import { PendingRequests } from "./requests.ts";
import { toolInput, toolLabel } from "./tool-label.ts";
import {
  unattendedDenial,
  type AdapterContext,
  type EventScope,
  type NativeAdapter,
  type TurnOptions,
} from "./types.ts";
import {
  startup,
  type CanUseTool,
  type McpServerConfig,
  type Options,
  type SDKControlInterruptResponse,
  type SDKMessage,
  type SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk";
import { randomUUID } from "node:crypto";

/* oxlint-disable deslop/no-runtime-typeof -- These checks validate host permission/question replies at the Claude SDK boundary. */

/**
 * Evidence from the installed @anthropic-ai/claude-agent-sdk 0.3.319 sdk.d.ts:
 * - steer: query() takes `prompt: string | AsyncIterable<SDKUserMessage>` (sdk.d.ts:3377) and
 *   WarmQuery.query takes the same (sdk.d.ts:10513). One queue stays open for the session, and
 *   queued user messages fold into the running turn between tool rounds (sdk.d.ts:6061).
 * - steerEvidence: SDKUserMessage.uuid (sdk.d.ts:6761) is echoed in result.user_message_uuids
 *   (sdk.d.ts:6063) and assistant user_message_uuids (sdk.d.ts:3762).
 * - interruptReceipt: Query.interrupt() resolves to SDKControlInterruptResponse with
 *   still_queued (sdk.d.ts:2979, 4898) on CLIs advertising interrupt_receipt_v1 (sdk.d.ts:6407);
 *   older CLIs resolve undefined, which reports no evidence.
 * - usage: result usage and modelUsage[].contextWindow (sdk.d.ts:6037-6041, 1524).
 * - noAskProfile: canUseTool may return { behavior: "deny", message } (sdk.d.ts:228, 2627).
 * - compact: no compact control request in the Query interface (sdk.d.ts:2965-3346). Only the
 *   compact_boundary output message exists (sdk.d.ts:3890), so compact stays off.
 */
export const claudeCapabilities: AdapterCapabilities = {
  steer: true,
  steerEvidence: true,
  compact: false,
  usage: true,
  noAskProfile: true,
  interruptReceipt: true,
};

/** The part of the SDK Query this adapter uses. Tests supply a fake. */
export interface ClaudeQuery extends AsyncIterable<SDKMessage> {
  interrupt(): Promise<SDKControlInterruptResponse | undefined>;
  close(): void;
}

type Uuid = SDKUserMessage["uuid"] & string;

interface LiveTurn {
  uuid: string;
  inputIds: string[];
  mode: TurnOptions["mode"];
  steered: Set<string>;
  consumed: Set<string>;
  interrupted: boolean;
  status?: TurnResult["status"];
  usage?: Usage;
  resolve(result: TurnResult): void;
}

function stamps(message: SDKMessage): string[] | undefined {
  if (message.type !== "assistant" && message.type !== "result" && message.type !== "stream_event")
    return undefined;
  if (message.user_message_uuids?.length) return message.user_message_uuids;
  return message.user_message_uuid ? [message.user_message_uuid] : undefined;
}

/** Maps one long-lived Claude streaming-input session onto host turns. */
export class ClaudeSession {
  readonly input = new InputQueue<SDKUserMessage>();
  private readonly requests = new PendingRequests();
  /** Native message uuid → our input IDs. */
  private readonly groups = new Map<string, string[]>();
  /** Still-queued messages reported by an interrupt. Their native turn is stopped if it starts. */
  private readonly doomed = new Set<string>();
  private turnState: LiveTurn | undefined;
  /** Who owns the native turn now streaming, from the latest stamped frame. */
  private owner: "ours" | "other" | undefined;
  private contextUsed: number | undefined;
  private query: ClaudeQuery | undefined;
  private closed = false;
  private readonly context: AdapterContext;
  private readonly nativeSessionId: string;

  constructor(context: AdapterContext, nativeSessionId: string) {
    this.context = context;
    this.nativeSessionId = nativeSessionId;
  }

  readonly canUseTool: CanUseTool = async (toolName, input, { signal }) => {
    const turn = this.turnState;
    // Prompts outside our interactive turn have no owner waiting for them.
    if (!turn || turn.mode === "unattended" || this.owner === "other")
      return { behavior: "deny", message: unattendedDenial };
    const response = await this.requests.request(
      (requestId) =>
        this.context.emit({
          type: "request.opened",
          kind: toolName === "AskUserQuestion" ? "input" : "permission",
          requestId,
          data: { toolName, input },
        }),
      signal,
    );
    if (toolName === "AskUserQuestion") {
      const isAnswerObject =
        typeof response === "object" && response !== null && !Array.isArray(response);
      if (!isAnswerObject || !Object.values(response).every((answer) => typeof answer === "string"))
        throw new HarnessError(
          "invalid-response",
          "Claude questions require an object mapping question text to answer text.",
        );
      return { behavior: "allow", updatedInput: { ...input, answers: response } };
    }
    if (response === "allow") return { behavior: "allow", updatedInput: input };
    if (response !== "deny")
      throw new HarnessError("invalid-response", "Claude permissions accept allow or deny.");
    return { behavior: "deny", message: "Denied by host user." };
  };

  /** Starts reading the native stream. Call once with the query built on this.input. */
  attach(query: ClaudeQuery): NativeAdapter {
    this.query = query;
    void (async () => {
      try {
        for await (const message of query) this.handle(message);
      } catch {
        if (!this.closed)
          this.context.emit({
            type: "error",
            code: "native-stream",
            message: "Claude stream ended. Reopen the session to continue.",
          });
      } finally {
        this.finish("failed", "Claude stream ended.");
      }
    })();
    return {
      capabilities: claudeCapabilities,
      nativeSessionId: this.nativeSessionId,
      turn: (input, options) => {
        if (this.closed) throw new HarnessError("disconnected", "Claude connection is closed.");
        if (this.turnState) throw new HarnessError("turn-active", "A turn is already running.");
        const uuid = this.uuidFor(input.inputIds);
        const done = new Promise<TurnResult>((resolve) => {
          this.turnState = {
            uuid,
            inputIds: input.inputIds,
            mode: options.mode,
            steered: new Set(),
            consumed: new Set(),
            interrupted: false,
            resolve,
          };
        });
        this.send(uuid, input.text);
        return done;
      },
      steer: async ({ inputId, text }) => {
        const turn = this.turnState;
        if (!turn) throw new HarnessError("no-turn", "No turn is running.");
        const uuid = this.uuidFor([inputId]);
        turn.steered.add(uuid);
        this.send(uuid, text);
      },
      interrupt: () => this.interrupt(),
      respond: async (requestId, response) => {
        this.requests.respond(requestId, response);
      },
      disconnect: async () => {
        this.closed = true;
        this.requests.cancel();
        this.input.close();
        this.query?.close();
        this.finish("failed", "Claude disconnected.");
      },
    };
  }

  /**
   * A fresh uuid per sent message. An inbox item ID would repeat when a later attempt resends
   * the same item into the same native transcript; groups maps each uuid back to our input IDs.
   */
  private uuidFor(inputIds: string[]): Uuid {
    const uuid = randomUUID();
    this.groups.set(uuid, inputIds);
    return uuid;
  }

  private send(uuid: Uuid, text: string) {
    const message: SDKUserMessage = {
      type: "user",
      message: { role: "user", content: text },
      parent_tool_use_id: null,
      uuid,
    };
    this.input.push(message);
  }

  private async interrupt(): Promise<InterruptReceipt> {
    const turn = this.turnState;
    if (!turn || !this.query) return {};
    turn.interrupted = true;
    this.requests.cancel();
    const receipt = await this.query.interrupt();
    if (!receipt) return {};
    const ours = receipt.still_queued.filter(
      (uuid) => uuid === turn.uuid || turn.steered.has(uuid),
    );
    for (const uuid of ours) this.doomed.add(uuid);
    const stillQueuedInputIds = ours.flatMap((uuid) => this.groups.get(uuid) ?? []);
    // The turn's own input never started, so no result for it will arrive.
    if (ours.includes(turn.uuid)) this.finish("interrupted");
    return { stillQueuedInputIds };
  }

  private scope(): EventScope {
    return this.turnState && this.owner !== "other" ? "turn" : "session";
  }

  private handle(message: SDKMessage) {
    const turn = this.turnState;
    const stamped = stamps(message);
    if (stamped) {
      const isOurs = Boolean(
        turn && stamped.some((uuid) => uuid === turn.uuid || turn.steered.has(uuid)),
      );
      this.owner = isOurs ? "ours" : "other";
      if (turn && isOurs) this.consume(turn, stamped);
      if (!isOurs && stamped.some((uuid) => this.doomed.has(uuid))) {
        for (const uuid of stamped) this.doomed.delete(uuid);
        // A still-queued input from an interrupted turn started on its own. Stop it: the host
        // already reported it as unconsumed and sends it again.
        void this.query?.interrupt().catch(() => {});
      }
    }
    const scope = this.scope();
    if (message.type === "assistant") {
      if (message.parent_tool_use_id === null) {
        const usage = message.message.usage;
        this.contextUsed =
          usage.input_tokens +
          (usage.cache_read_input_tokens ?? 0) +
          (usage.cache_creation_input_tokens ?? 0) +
          usage.output_tokens;
      }
      for (const block of message.message.content) {
        if (block.type === "text" && block.text.trim())
          this.context.emit({ type: "text", text: block.text }, scope);
        else if (block.type === "tool_use")
          this.context.emit(
            {
              type: "item.started",
              itemId: block.id,
              itemType: "tool",
              title: toolLabel(block.name, toolInput.parse(block.input)),
            },
            scope,
          );
      }
    } else if (message.type === "user") {
      const content = message.message.content;
      if (Array.isArray(content))
        for (const block of content)
          if (block.type === "tool_result")
            this.context.emit(
              {
                type: "item.completed",
                itemId: block.tool_use_id,
                status: block.is_error ? "failed" : "completed",
              },
              scope,
            );
    } else if (message.type === "system" && message.subtype === "compact_boundary")
      this.context.emit({ type: "compaction" }, scope);
    else if (message.type === "result") {
      const usage: Usage = {
        inputTokens: message.usage.input_tokens,
        outputTokens: message.usage.output_tokens,
        cachedInputTokens: message.usage.cache_read_input_tokens,
        contextUsed: this.contextUsed,
        contextWindow:
          Math.max(0, ...Object.values(message.modelUsage).map((entry) => entry.contextWindow)) ||
          undefined,
      };
      this.context.emit({ type: "usage.updated", usage }, scope);
      // Older producers do not stamp results; then the result belongs to whatever is streaming.
      const isOurs = turn && (stamped ? this.owner === "ours" : this.owner !== "other");
      this.owner = undefined;
      if (!turn || !isOurs) return;
      turn.usage = usage;
      let status: TurnResult["status"] = message.is_error ? "failed" : "completed";
      if (turn.interrupted) status = "interrupted";
      turn.status = status;
      const pendingSteer = [...turn.steered].some(
        (uuid) => !this.groups.get(uuid)?.every((id) => turn.consumed.has(id)),
      );
      // Steered input that missed this native turn runs next as its own native turn. Keep our
      // turn open so its output stays attributed to it.
      if (pendingSteer && !turn.interrupted && (message.queued_turn_count ?? 0) > 0) return;
      this.finish(status, status === "failed" ? "Claude turn failed." : undefined);
    }
  }

  private consume(turn: LiveTurn, uuids: string[]) {
    for (const uuid of uuids) {
      if (uuid !== turn.uuid && !turn.steered.has(uuid)) continue;
      for (const id of this.groups.get(uuid) ?? []) {
        if (turn.consumed.has(id)) continue;
        turn.consumed.add(id);
        if (uuid !== turn.uuid) this.context.emit({ type: "input.consumed", inputId: id }, "turn");
      }
    }
  }

  private finish(status: TurnResult["status"], error?: string) {
    const turn = this.turnState;
    if (!turn) return;
    this.turnState = undefined;
    this.requests.cancel();
    const result: TurnResult = {
      status: turn.status ?? status,
      consumedInputIds: [...turn.consumed],
    };
    if (error && result.status === "failed") result.error = error;
    if (turn.usage) result.usage = turn.usage;
    turn.resolve(result);
  }
}

export async function connectClaude(
  context: AdapterContext,
  resumeId?: string,
): Promise<NativeAdapter> {
  const nativeSessionId = resumeId ?? randomUUID();
  const session = new ClaudeSession(context, nativeSessionId);
  const mcpServers: Record<string, McpServerConfig> = context.lease
    ? {
        "substrate": {
          type: "http",
          url: context.lease.url,
          headers: { Authorization: `Bearer ${context.lease.token}` },
        },
      }
    : {};
  const options: Options = {
    cwd: context.directory,
    pathToClaudeCodeExecutable: context.executable,
    settingSources: ["user", "project", "local"],
    // The managed prefix is appended once per session open, so it stays byte-stable.
    systemPrompt: { type: "preset", preset: "claude_code", append: context.prefix },
    model: context.model,
    mcpServers,
    persistSession: true,
    ...(resumeId ? { resume: resumeId } : { sessionId: nativeSessionId }),
    canUseTool: session.canUseTool,
  };
  const warm = await startup({ options, initializeTimeoutMs: 30_000 });
  return session.attach(warm.query(session.input));
}
