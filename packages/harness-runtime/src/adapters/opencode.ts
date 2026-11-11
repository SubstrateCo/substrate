import type {
  AdapterCapabilities,
  InterruptReceipt,
  TurnResult,
  Usage,
} from "@substrate/contracts/harness";

import { HarnessError } from "../errors.ts";
import { safePath } from "../paths.ts";
import { startOpenCode } from "./opencode-client.ts";
import { toolInput, toolLabel, type ToolInput } from "./tool-label.ts";
import {
  unattendedDenial,
  type AdapterContext,
  type EventScope,
  type NativeAdapter,
  type TurnOptions,
} from "./types.ts";
import type { OpenCodeClient, OpenCodeEvent } from "@opencode/client";
import { writeFile } from "node:fs/promises";

/* oxlint-disable deslop/no-runtime-typeof -- Host form responses and the native endpoint announcement are validated at this I/O boundary. */

/**
 * Evidence from the installed @opencode/client 2.2.5 (dist/promise/generated/types.d.ts unless
 * noted):
 * - steer: SessionPromptInput has `id` and `delivery` (:4179); SessionInboxDelivery is
 *   "steer" | "queue" (:115). Message IDs must start with "msg_" (@opencode/schema 2.2.5
 *   dist/session-message.js:19).
 * - steerEvidence: session.inbox.delivered carries the inboxID (:1675, effect/client.d.ts:913).
 * - interruptReceipt: session.inbox.list and session.inbox.cancel (:4322-4331) show and withdraw
 *   inputs that are still queued after session.interrupt (:4344).
 * - compact: session.compact (:4283, promise/client.d.ts:233); session.compaction.ended event.
 * - usage: session.usage.updated carries token counts but no context window
 *   (effect/client.d.ts:2712).
 * - noAskProfile: permission.reply accepts decision "reject" with a message (:5210) and
 *   session.form.cancel accepts a message (:4584).
 */
export const openCodeCapabilities: AdapterCapabilities = {
  steer: true,
  steerEvidence: true,
  compact: true,
  usage: true,
  noAskProfile: true,
  interruptReceipt: true,
};

export function openCodeModel(value?: string): { providerID: string; id: string } | undefined {
  if (!value) return undefined;
  const index = value.indexOf("/");
  if (index <= 0 || index === value.length - 1)
    throw new HarnessError("invalid-model", "OpenCode models use provider/model IDs.");
  return { providerID: value.slice(0, index), id: value.slice(index + 1) };
}

const idChars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
let lastTimestamp = 0;
let counter = 0;
/** Ascending message IDs in OpenCode's own format, so native ordering stays chronological. */
export function openCodeMessageId(now = Date.now()): string {
  if (now !== lastTimestamp) {
    lastTimestamp = now;
    counter = 0;
  }
  counter++;
  const value = BigInt(now) * 0x1000n + BigInt(counter);
  const time = Array.from({ length: 6 }, (_, index) =>
    Number((value >> BigInt(40 - 8 * index)) & 0xffn)
      .toString(16)
      .padStart(2, "0"),
  ).join("");
  const random = crypto.getRandomValues(new Uint8Array(14));
  return `msg_${time}${Array.from(random, (byte) => idChars[byte % 62]).join("")}`;
}

/** The part of the OpenCode client this adapter uses. Tests supply a fake. */
export interface OpenCodeApi {
  session: Pick<OpenCodeClient["session"], "prompt" | "interrupt" | "compact"> & {
    inbox: Pick<OpenCodeClient["session"]["inbox"], "list" | "cancel">;
    form: Pick<OpenCodeClient["session"]["form"], "reply" | "cancel">;
  };
  permission: Pick<OpenCodeClient["permission"], "reply">;
}

interface LiveTurn {
  messageId: string;
  mode: TurnOptions["mode"];
  delivered: boolean;
  interrupted: boolean;
  steered: Set<string>;
  consumed: Set<string>;
  usage?: Usage;
  resolve(result: TurnResult): void;
}

/** Maps one OpenCode native session onto host turns. */
export class OpenCodeSession {
  private readonly requests = new Map<string, "permission" | "input">();
  /** Native message ID → our input IDs. */
  private readonly groups = new Map<string, string[]>();
  /** Native tool call ID → tool name, until the call's step starts. */
  private readonly tools = new Map<string, string>();
  private turnState: LiveTurn | undefined;
  private readonly context: AdapterContext;
  private readonly client: OpenCodeApi;
  private readonly sessionID: string;

  constructor(context: AdapterContext, client: OpenCodeApi, sessionID: string) {
    this.context = context;
    this.client = client;
    this.sessionID = sessionID;
  }

  /** Output before our input was delivered belongs to earlier native work. */
  private scope(): EventScope {
    return this.turnState?.delivered ? "turn" : "session";
  }

  /**
   * A tool's step starts once its input is known, so its label can say what it does. Input
   * streams after session.tool.input.started and is complete at session.tool.called.
   */
  private startTool(id: string, input?: ToolInput) {
    const name = this.tools.get(id);
    if (name === undefined) return;
    this.tools.delete(id);
    this.context.emit(
      { type: "item.started", itemId: id, itemType: "tool", title: toolLabel(name, input) },
      this.scope(),
    );
  }

  handle(event: OpenCodeEvent): void {
    if (event.type === "form.created") {
      if (event.data.form.sessionID !== this.sessionID) return;
      const formID = event.data.form.id;
      if (!this.turnState || this.turnState.mode === "unattended") {
        void this.client.session.form
          .cancel({ sessionID: this.sessionID, formID, message: unattendedDenial })
          .catch(() => {});
        return;
      }
      this.requests.set(formID, "input");
      this.context.emit({
        type: "request.opened",
        requestId: formID,
        kind: "input",
        data: event.data.form,
      });
      return;
    }
    if (!("sessionID" in event.data) || event.data.sessionID !== this.sessionID) return;
    const turn = this.turnState;
    const type = event.type;
    if (type === "permission.asked") {
      if (!turn || turn.mode === "unattended") {
        void this.client.permission
          .reply({
            sessionID: this.sessionID,
            requestID: event.data.id,
            decision: "reject",
            message: unattendedDenial,
          })
          .catch(() => {});
        return;
      }
      this.requests.set(event.data.id, "permission");
      this.context.emit({
        type: "request.opened",
        requestId: event.data.id,
        kind: "permission",
        data: event.data,
      });
    } else if (type === "session.inbox.delivered") {
      if (!turn) return;
      const inboxID = event.data.inboxID;
      if (inboxID === turn.messageId) turn.delivered = true;
      else if (!turn.steered.has(inboxID)) return;
      for (const id of this.groups.get(inboxID) ?? []) {
        if (turn.consumed.has(id)) continue;
        turn.consumed.add(id);
        if (inboxID !== turn.messageId)
          this.context.emit({ type: "input.consumed", inputId: id }, "turn");
      }
    } else if (type === "session.text.ended") {
      if (event.data.text.trim())
        this.context.emit({ type: "text", text: event.data.text }, this.scope());
    } else if (type === "session.tool.input.started") {
      this.tools.set(event.data.id, event.data.name);
    } else if (type === "session.tool.called") {
      this.startTool(event.data.id, toolInput.parse(event.data.input));
    } else if (type === "session.tool.success" || type === "session.tool.failed") {
      // A tool that failed before its call, such as on invalid input, still shows as a step.
      this.startTool(event.data.id);
      this.context.emit(
        {
          type: "item.completed",
          itemId: event.data.id,
          status: type === "session.tool.success" ? "completed" : "failed",
        },
        this.scope(),
      );
    } else if (type === "session.usage.updated") {
      const usage: Usage = {
        inputTokens: event.data.tokens.input,
        outputTokens: event.data.tokens.output,
        cachedInputTokens: event.data.tokens.cache.read,
      };
      if (turn?.delivered) turn.usage = usage;
      this.context.emit({ type: "usage.updated", usage }, this.scope());
    } else if (type === "session.compaction.ended") {
      this.context.emit({ type: "compaction" }, this.scope());
    } else if (
      type === "session.execution.succeeded" ||
      type === "session.execution.failed" ||
      type === "session.execution.interrupted"
    ) {
      // An execution that ended before our input was delivered was earlier native work.
      if (!turn?.delivered) return;
      let status: TurnResult["status"] = "failed";
      if (type === "session.execution.succeeded") status = "completed";
      else if (type === "session.execution.interrupted" || turn.interrupted) status = "interrupted";
      this.finish(status);
    }
  }

  fail(message: string): void {
    this.finish("failed", message);
  }

  private finish(status: TurnResult["status"], error?: string) {
    const turn = this.turnState;
    if (!turn) return;
    this.turnState = undefined;
    const result: TurnResult = { status, consumedInputIds: [...turn.consumed] };
    if (error) result.error = error;
    if (turn.usage) result.usage = turn.usage;
    turn.resolve(result);
  }

  adapter(disconnect: () => Promise<void>): NativeAdapter {
    return {
      capabilities: openCodeCapabilities,
      nativeSessionId: this.sessionID,
      turn: async (input, options) => {
        if (this.turnState) throw new HarnessError("turn-active", "A turn is already running.");
        const messageId = openCodeMessageId();
        this.groups.set(messageId, input.inputIds);
        const done = new Promise<TurnResult>((resolve) => {
          this.turnState = {
            messageId,
            mode: options.mode,
            delivered: false,
            interrupted: false,
            steered: new Set(),
            consumed: new Set(),
            resolve,
          };
        });
        try {
          await this.client.session.prompt({
            sessionID: this.sessionID,
            id: messageId,
            text: input.text,
          });
        } catch {
          this.finish("failed", "OpenCode rejected the turn input.");
        }
        return done;
      },
      steer: async ({ inputId, text }) => {
        const turn = this.turnState;
        if (!turn) throw new HarnessError("no-turn", "No turn is running.");
        const messageId = openCodeMessageId();
        this.groups.set(messageId, [inputId]);
        turn.steered.add(messageId);
        await this.client.session.prompt({
          sessionID: this.sessionID,
          id: messageId,
          text,
          delivery: "steer",
        });
      },
      compact: async () => {
        await this.client.session.compact({ sessionID: this.sessionID });
      },
      interrupt: async (): Promise<InterruptReceipt> => {
        const turn = this.turnState;
        if (!turn) return {};
        turn.interrupted = true;
        await this.client.session.interrupt({ sessionID: this.sessionID });
        const queued = new Set(
          (await this.client.session.inbox.list({ sessionID: this.sessionID })).map(
            (item) => item.id,
          ),
        );
        const ours = [turn.messageId, ...turn.steered].filter((id) => queued.has(id));
        const withdrawn: string[] = [];
        // Only inputs withdrawn here are proven unconsumed; a failed cancel may have been delivered.
        for (const inboxID of ours)
          await this.client.session.inbox.cancel({ sessionID: this.sessionID, inboxID }).then(
            () => withdrawn.push(inboxID),
            () => {},
          );
        if (withdrawn.includes(turn.messageId)) this.finish("interrupted");
        return { stillQueuedInputIds: withdrawn.flatMap((id) => this.groups.get(id) ?? []) };
      },
      respond: async (requestId, response) => {
        const kind = this.requests.get(requestId);
        if (!kind) throw new HarnessError("unknown-request", "Unknown native request.");
        if (kind === "permission") {
          if (response !== "once" && response !== "always" && response !== "reject")
            throw new HarnessError(
              "invalid-response",
              "OpenCode permission accepts once, always, or reject.",
            );
          await this.client.permission.reply({
            sessionID: this.sessionID,
            requestID: requestId,
            decision: response,
          });
        } else {
          if (!response || typeof response !== "object" || Array.isArray(response))
            throw new HarnessError("invalid-response", "OpenCode forms require an answer object.");
          for (const value of Object.values(response))
            if (
              !["string", "number", "boolean"].includes(typeof value) &&
              !(Array.isArray(value) && value.every((item) => typeof item === "string"))
            )
              throw new HarnessError("invalid-response", "Unsupported form answer value.");
          // SAFETY: the object and every value were checked against the native form answer value union above.
          await this.client.session.form.reply({
            sessionID: this.sessionID,
            formID: requestId,
            answer: response as Record<string, string | number | boolean | string[]>,
          });
        }
        this.requests.delete(requestId);
      },
      disconnect: async () => {
        this.requests.clear();
        this.finish("failed", "OpenCode disconnected.");
        await disconnect();
      },
    };
  }
}

export async function connectOpenCode(
  context: AdapterContext,
  resumeId?: string,
): Promise<NativeAdapter> {
  // OpenCode loads extra instruction files from config. The managed prefix is one such file,
  // written once per session open so that it stays byte-stable.
  const managed = await safePath(
    context.directory,
    ".substrate/managed-instructions.md",
    false,
    true,
  );
  await writeFile(managed, context.prefix, { mode: 0o600 });
  const config = {
    instructions: [managed],
    mcp: context.lease
      ? {
          servers: {
            "substrate": {
              type: "remote",
              url: context.lease.url,
              oauth: false,
              headers: { Authorization: "Bearer {env:SUBSTRATE_MCP_TOKEN}" },
            },
          },
        }
      : undefined,
  };
  // --stdio emits the private endpoint and couples the server to its parent pipe.
  // This never discovers, reconfigures, or stops the user's shared service.
  const { client, close } = await startOpenCode(context.executable, context.directory, {
    OPENCODE_CONFIG_CONTENT: JSON.stringify(config),
    SUBSTRATE_MCP_TOKEN: context.lease?.token,
  });
  const controller = new AbortController();
  let eventLoop: Promise<void> | undefined;
  async function stop() {
    controller.abort();
    await eventLoop?.catch(() => {});
    await close();
  }
  try {
    const native = resumeId
      ? await client.session.get({ sessionID: resumeId })
      : await client.session.create({
          location: { directory: context.directory },
          model: openCodeModel(context.model),
        });
    if (native.location.directory !== context.directory)
      throw new HarnessError(
        "session-boundary",
        "Native OpenCode session belongs to another directory.",
      );
    const session = new OpenCodeSession(context, client, native.id);
    let connected: () => void = () => {};
    let rejectConnected: (error: Error) => void = () => {};
    const ready = new Promise<void>((resolve, reject) => {
      connected = resolve;
      rejectConnected = reject;
    });
    eventLoop = (async () => {
      try {
        for await (const event of client.event.subscribe({ signal: controller.signal })) {
          if (event.type === "server.connected") connected();
          else session.handle(event);
        }
      } catch (error) {
        rejectConnected(
          new HarnessError("event-stream", "OpenCode event stream failed.", { cause: error }),
        );
        if (!controller.signal.aborted) {
          session.fail("OpenCode event stream ended.");
          context.emit(
            {
              type: "error",
              code: "event-stream",
              message: "OpenCode event stream ended. Reopen the session to reconnect.",
            },
            "session",
          );
        }
      }
    })();
    const timer = setTimeout(
      () =>
        rejectConnected(
          new HarnessError("event-timeout", "OpenCode event stream did not connect."),
        ),
      15_000,
    );
    try {
      await ready;
    } finally {
      clearTimeout(timer);
    }
    return session.adapter(stop);
  } catch (error) {
    await stop();
    throw error;
  }
}
