import { HarnessError } from "../errors.ts";
import { PendingRequests } from "./requests.ts";
import type { AdapterContext, NativeAdapter } from "./types.ts";
import { query, startup, type Options, type McpServerConfig } from "@anthropic-ai/claude-agent-sdk";
import { randomUUID } from "node:crypto";

/* oxlint-disable deslop/no-runtime-typeof -- These checks validate host permission/question replies at the Claude SDK boundary. */

export async function connectClaude(
  context: AdapterContext,
  resumeId?: string,
): Promise<NativeAdapter> {
  const nativeSessionId = resumeId ?? randomUUID();
  const requests = new PendingRequests();
  const mcpServers: Record<string, McpServerConfig> = context.lease
    ? {
        "startup-os": {
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
    systemPrompt: { type: "preset", preset: "claude_code", append: context.agent.instructions },
    model: context.agent.model,
    mcpServers,
    includePartialMessages: true,
    persistSession: true,
    ...(resumeId ? { resume: resumeId } : { sessionId: nativeSessionId }),
    async canUseTool(toolName, input, { signal }) {
      const response = await requests.request(
        (requestId) =>
          context.emit({
            type: "request",
            kind: toolName === "AskUserQuestion" ? "input" : "permission",
            requestId,
            data: { toolName, input },
          }),
        signal,
      );
      if (toolName === "AskUserQuestion") {
        const isAnswerObject =
          typeof response === "object" && response !== null && !Array.isArray(response);
        if (
          !isAnswerObject ||
          !Object.values(response).every((answer) => typeof answer === "string")
        )
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
    },
  };
  let warm: Awaited<ReturnType<typeof startup>> | undefined = await startup({
    options,
    initializeTimeoutMs: 30_000,
  });
  let current: ReturnType<typeof query> | undefined;
  let started = Boolean(resumeId);
  let disconnected = false;
  return {
    nativeSessionId,
    async prompt(text) {
      if (disconnected) throw new HarnessError("disconnected", "Claude connection is closed.");
      const first = warm;
      warm = undefined;
      current = first
        ? first.query(text)
        : query({
            prompt: text,
            options: {
              ...options,
              sessionId: undefined,
              resume: started ? nativeSessionId : undefined,
            },
          });
      started = true;
      try {
        for await (const message of current) {
          if (
            message.type === "stream_event" &&
            message.event.type === "content_block_delta" &&
            message.event.delta.type === "text_delta"
          )
            context.emit({ type: "text", text: message.event.delta.text, delta: true });
          else if (message.type === "result")
            context.emit({
              type: "turn-completed",
              status: message.is_error ? "failed" : "completed",
            });
          else if (
            message.type !== "assistant" &&
            message.type !== "user" &&
            message.type !== "stream_event"
          )
            context.emit({ type: "activity", name: message.type, data: message });
        }
      } finally {
        current = undefined;
        requests.cancel();
      }
    },
    async interrupt() {
      requests.cancel();
      await current?.interrupt();
    },
    async respond(id, response) {
      requests.respond(id, response);
    },
    async disconnect() {
      disconnected = true;
      requests.cancel();
      current?.close();
      warm?.close();
    },
  };
}
