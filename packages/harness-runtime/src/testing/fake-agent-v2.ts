import type {
  FakeAgentRecord,
  FakeAgentScript,
  FakeRecordChanged,
  FakeStep,
} from "./fake-agent.ts";
import {
  agent,
  isMcpServerAcp,
  McpOverAcpCaller,
  RequestError,
  type AgentCapabilities,
  type AuthMethod,
  type CreateElicitationResponse,
  type RequestPermissionResponse,
  type SessionConfigOption,
  type ToolCallUpdate,
  type AgentContext,
  type ElicitationSchema,
  type PromptResponse,
  type SessionUpdate,
  type StateUpdate,
  type Usage,
} from "@agentclientprotocol/sdk/experimental/v2/unstable";

export interface FakeV2Options {
  capabilities?: AgentCapabilities;
  authMethods?: AuthMethod[];
  configOptions?: SessionConfigOption[];
  holdPrompts?: boolean;
  honorCancelRequest?: boolean;
}

export type FakeV2Step =
  | { toolUpdate: ToolCallUpdate }
  | { message: { id: string; text: string | null } };

export interface FakeV2Answers {
  permission: RequestPermissionResponse;
  elicitation: CreateElicitationResponse;
}

interface Run {
  sessionId: string;
  cancelled: boolean;
  requests: AbortController;
  cancel(): void;
  steer(): void;
  stopped: Promise<void>;
}

interface HeldPrompt {
  sessionId: string;
  text: string;
  resolve(response: PromptResponse): void;
  reject(error: RequestError): void;
}

/** The v1 stop reasons keep their names in v2 (IdleStateUpdate). */
function idleState(
  reason: NonNullable<FakeAgentScript["stopReason"]>,
  usage?: Usage | null,
): StateUpdate {
  switch (reason) {
    case "end_turn":
      return { state: "idle", stopReason: "end_turn", usage };
    case "max_tokens":
      return { state: "idle", stopReason: "max_tokens", usage };
    case "max_turn_requests":
      return { state: "idle", stopReason: "max_turn_requests", usage };
    case "refusal":
      return { state: "idle", stopReason: "refusal", usage };
    case "cancelled":
      return { state: "idle", stopReason: "cancelled", usage };
  }
}

function promptText(prompt: { type: string; text?: string }[]) {
  return prompt.map((block) => (block.type === "text" ? (block.text ?? "") : "")).join("");
}

export function fakeAgentAppV2(
  script: FakeAgentScript,
  record: FakeAgentRecord,
  exit: (code: number) => void,
  changed: FakeRecordChanged,
) {
  const options = script.v2 ?? {};
  let authed = !script.requireAuth;
  let sessions = 0;
  let messages = 0;
  let configOptions = structuredClone(options.configOptions ?? []);
  let running: Run | undefined;
  const held: HeldPrompt[] = [];
  const acpServers = new Map<string, Map<string, string>>();
  const caller = new McpOverAcpCaller({ clientInfo: { name: "fake-agent", version: "1.0.0" } });
  const declare = (sessionId: string, servers: unknown[] | undefined) =>
    acpServers.set(
      sessionId,
      new Map(
        (servers ?? []).flatMap((server) =>
          isMcpServerAcp(server) ? [[server.name, server.serverId] as const] : [],
        ),
      ),
    );
  const log = <Params extends object>(method: string, params: Params) => {
    record.calls.push({ method, params });
    changed();
  };
  const wait = (step: FakeAgentRecord["waits"][number]) => {
    record.waits.push(step);
    changed();
  };
  const send = (client: AgentContext, sessionId: string, update: SessionUpdate) =>
    client.notify("session/update", { sessionId, update });
  const state = (client: AgentContext, sessionId: string, update: StateUpdate) =>
    send(client, sessionId, { sessionUpdate: "state_update", ...update });
  const availableCommands = () =>
    (script.commands ?? []).map((name) => ({ type: "command" as const, name, description: name }));
  const requireAuth = () => {
    if (!authed) throw RequestError.authRequired();
  };
  const stepsFor = (text: string): FakeStep[] =>
    text === "/compact" && script.commands?.includes("compact")
      ? [{ compaction: "in_progress" }, { compaction: "completed" }]
      : (script.turns?.[text] ?? script.defaultTurn ?? [{ text: "ok" }]);

  async function insert(client: AgentContext, sessionId: string, text: string) {
    const messageId = `user-${++messages}`;
    await send(client, sessionId, {
      sessionUpdate: "user_message",
      messageId,
      content: [{ type: "text", text }],
    });
    return messageId;
  }

  async function step(
    client: AgentContext,
    run: Run,
    entry: FakeStep,
    steered: () => Promise<void>,
  ) {
    const sessionId = run.sessionId;
    const bounded = { cancellationSignal: run.requests.signal, stopWaitingOnCancel: true };
    if ("text" in entry)
      await send(client, sessionId, {
        sessionUpdate: "agent_message_chunk",
        messageId: entry.messageId ?? "agent-1",
        content: { type: "text", text: entry.text },
      });
    else if ("message" in entry)
      await send(client, sessionId, {
        sessionUpdate: "agent_message",
        messageId: entry.message.id,
        content: entry.message.text === null ? null : [{ type: "text", text: entry.message.text }],
      });
    else if ("tool" in entry)
      await send(client, sessionId, {
        sessionUpdate: "tool_call_update",
        toolCallId: entry.tool.id,
        title: entry.tool.title,
        name: entry.tool.name,
        kind: entry.tool.kind,
        rawInput: entry.tool.rawInput,
        status: entry.tool.status ?? "pending",
      });
    else if ("toolDone" in entry)
      await send(client, sessionId, {
        sessionUpdate: "tool_call_update",
        toolCallId: entry.toolDone.id,
        status: entry.toolDone.status,
      });
    else if ("toolUpdate" in entry)
      await send(client, sessionId, { sessionUpdate: "tool_call_update", ...entry.toolUpdate });
    else if ("usage" in entry)
      await send(client, sessionId, { sessionUpdate: "usage_update", ...entry.usage });
    else if ("compaction" in entry)
      await send(client, sessionId, {
        sessionUpdate: "compaction_update",
        compactionId: "compaction-1",
        status: entry.compaction,
      });
    else if ("permission" in entry) {
      await state(client, sessionId, { state: "requires_action" });
      try {
        record.permissions.push(
          await client.request(
            "session/request_permission",
            {
              sessionId,
              title: "Run tool",
              subject: {
                type: "tool_call",
                toolCall: { toolCallId: entry.permission.toolCallId, title: "Run tool" },
              },
              options: entry.permission.options ?? [
                { optionId: "allow", name: "Allow", kind: "allow_once" },
                { optionId: "reject", name: "Reject", kind: "reject_once" },
              ],
            },
            bounded,
          ),
        );
      } catch {
        record.permissions.push({ outcome: { outcome: "cancelled" } });
      }
      if (!run.cancelled) await state(client, sessionId, { state: "running" });
    } else if ("elicitation" in entry) {
      await state(client, sessionId, { state: "requires_action" });
      try {
        record.elicitations.push(
          await client.request(
            "elicitation/create",
            {
              sessionId,
              mode: "form",
              message: entry.elicitation.message,
              // SAFETY: test scripts use form schemas without v1's pattern, the one v2 removal.
              requestedSchema: entry.elicitation.requestedSchema as ElicitationSchema,
            },
            bounded,
          ),
        );
      } catch {
        record.elicitations.push({ action: "cancel" });
      }
      if (!run.cancelled) await state(client, sessionId, { state: "running" });
    } else if ("mcp" in entry) {
      const serverId = acpServers.get(sessionId)?.get(entry.mcp.server) ?? entry.mcp.server;
      record.mcp.push(await caller.request(client, serverId, entry.mcp.method, entry.mcp.params));
    } else if ("waitForCancel" in entry) {
      wait("waitForCancel");
      await run.stopped;
    } else if ("waitForSteer" in entry) {
      wait("waitForSteer");
      await steered();
    } else if ("exit" in entry) {
      exit(entry.exit);
      await new Promise(() => {});
    }
  }

  function start(client: AgentContext, sessionId: string, steps: FakeStep[]) {
    const cancel = Promise.withResolvers<void>();
    let steered = Promise.withResolvers<void>();
    const run: Run = {
      sessionId,
      cancelled: false,
      requests: new AbortController(),
      cancel: () => {
        run.cancelled = true;
        run.requests.abort();
        cancel.resolve();
      },
      steer: () => steered.resolve(),
      stopped: cancel.promise,
    };
    running = run;
    const finished = (async () => {
      await state(client, sessionId, { state: "running" });
      for (const entry of steps) {
        if (run.cancelled) break;
        await step(client, run, entry, async () => {
          await Promise.race([steered.promise, cancel.promise]);
          steered = Promise.withResolvers<void>();
        });
      }
      running = undefined;
      await state(
        client,
        sessionId,
        idleState(
          run.cancelled ? "cancelled" : (script.stopReason ?? "end_turn"),
          script.promptUsage,
        ),
      );
      const next = options.honorCancelRequest ? undefined : held.shift();
      if (next) {
        const messageId = await insert(client, next.sessionId, next.text);
        record.steers.push(next.text);
        next.resolve({ messageId });
        await start(client, next.sessionId, stepsFor(next.text));
      }
    })();
    return finished.catch(() => {});
  }

  const dropHeld = () => {
    for (const prompt of held.splice(0)) prompt.reject(RequestError.requestCancelled());
  };

  return agent({ name: "fake-agent-v2" })
    .onRequest("initialize", ({ params }) => {
      log("initialize", params);
      return {
        protocolVersion: 2,
        info: script.agentInfo ?? { name: "fake-agent", version: "1.0.0" },
        capabilities: options.capabilities ?? { session: { mcp: { stdio: {}, http: {} } } },
        authMethods: options.authMethods ?? [],
      };
    })
    .onRequest("auth/login", ({ params }) => {
      log("auth/login", params);
      authed = true;
      return {};
    })
    .onRequest("auth/logout", ({ params }) => {
      log("auth/logout", params);
      authed = !script.requireAuth;
      return {};
    })
    .onRequest("session/new", ({ params }) => {
      log("session/new", params);
      requireAuth();
      if (!script.ignoreConfigChanges)
        for (const value of params.configOptions ?? [])
          configOptions = configOptions.map((option) =>
            option.configId === value.configId && option.type === "select" && value.type === "id"
              ? { ...option, currentValue: String(value.value) }
              : option,
          );
      const sessionId = `fake-session-${++sessions}`;
      declare(sessionId, params.mcpServers);
      return {
        sessionId,
        configOptions,
        availableCommands: availableCommands(),
      };
    })
    .onRequest("session/resume", async ({ params, client }) => {
      log("session/resume", params);
      requireAuth();
      declare(params.sessionId, params.mcpServers);
      if (params.replayFrom) {
        await send(client, params.sessionId, {
          sessionUpdate: "agent_message",
          messageId: "replayed",
          content: [{ type: "text", text: "replayed history" }],
        });
        await send(client, params.sessionId, { sessionUpdate: "replay_complete" });
      }
      await state(client, params.sessionId, { state: "idle" });
      return { configOptions, availableCommands: availableCommands() };
    })
    .onRequest("session/list", ({ params }) => {
      log("session/list", params);
      return { sessions: [] };
    })
    .onRequest("session/options", ({ params }) => {
      log("session/options", params);
      return { configOptions, availableCommands: availableCommands() };
    })
    .onRequest("session/close", async ({ params }) => {
      log("session/close", params);
      dropHeld();
      const run = running;
      run?.cancel();
      return {};
    })
    .onRequest("session/delete", ({ params }) => {
      log("session/delete", params);
      return {};
    })
    .onRequest("session/set_config_option", ({ params }) => {
      log("session/set_config_option", params);
      if (!script.ignoreConfigChanges && params.type === "id")
        configOptions = configOptions.map((option) =>
          option.configId === params.configId && option.type === "select"
            ? { ...option, currentValue: String(params.value) }
            : option,
        );
      return { configOptions };
    })
    .onRequest("session/prompt", async ({ params, client, signal }) => {
      log("session/prompt", params);
      const text = promptText(params.prompt);
      const sessionId = params.sessionId;
      const active = running;
      if (active && options.holdPrompts)
        return new Promise<PromptResponse>((resolve, reject) => {
          const prompt: HeldPrompt = { sessionId, text, resolve, reject };
          held.push(prompt);
          if (options.honorCancelRequest)
            signal.addEventListener("abort", () => {
              const index = held.indexOf(prompt);
              if (index < 0) return;
              held.splice(index, 1);
              reject(RequestError.requestCancelled());
            });
        });
      const messageId = await insert(client, sessionId, text);
      if (active) {
        record.steers.push(text);
        active.steer();
      } else void start(client, sessionId, stepsFor(text));
      return { messageId };
    })
    .onNotification("session/cancel", ({ params }) => {
      log("session/cancel", params);
      dropHeld();
      running?.cancel();
    });
}
