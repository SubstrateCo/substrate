import { nativeName } from "../config.ts";
import { HarnessError, unsupported } from "../errors.ts";
import { antigravityAcpAvailable, launch, stopProcess } from "../process.ts";
import { PendingRequests } from "./requests.ts";
import type { AdapterContext, NativeAdapter } from "./types.ts";
import {
  client,
  ndJsonStream,
  PROTOCOL_VERSION,
  type McpServer,
  type RequestPermissionResponse,
} from "@agentclientprotocol/sdk";
import { Readable, Writable } from "node:stream";

/* oxlint-disable deslop/no-runtime-typeof -- These checks validate host responses at the ACP I/O boundary. */

export async function connectAntigravity(
  context: AdapterContext,
  resumeId?: string,
): Promise<NativeAdapter> {
  if (!(await antigravityAcpAvailable(context.executable)))
    unsupported(
      "Installed Antigravity CLI lacks agy acp --process-per-session. Update agy to an ACP-capable release; no print-mode fallback is used.",
    );
  const name = nativeName(context.agent.id);
  const child = launch(
    context.executable,
    ["acp", "--process-per-session", "--agent", name],
    context.directory,
  );
  const requests = new PendingRequests();
  let nativeSessionId = resumeId ?? "";
  const app = client()
    .onNotification("session/update", ({ params: notification }) => {
      if (notification.sessionId !== nativeSessionId) return;
      const update = notification.update;
      if (update.sessionUpdate === "agent_message_chunk" && update.content.type === "text")
        context.emit({ type: "text", text: update.content.text, delta: true });
      else context.emit({ type: "activity", name: update.sessionUpdate, data: update });
    })
    .onRequest("session/request_permission", async ({ params: request, signal }) => {
      if (request.sessionId !== nativeSessionId) return { outcome: { outcome: "cancelled" } };
      const response = await requests.request(
        (requestId) =>
          context.emit({ type: "request", kind: "permission", requestId, data: request }),
        signal,
      );
      const optionId = typeof response === "string" ? response : undefined;
      if (!request.options.some((option) => option.optionId === optionId))
        throw new HarnessError(
          "invalid-response",
          "Choose one of the native permission option IDs.",
        );
      return {
        outcome: { outcome: "selected", optionId: optionId! },
      } satisfies RequestPermissionResponse;
    });
  // SAFETY: piped Node stdout emits Buffer (a Uint8Array); Node and DOM stream types differ only in ambient declarations here.
  const connection = app.connect(
    ndJsonStream(
      Writable.toWeb(child.stdin),
      Readable.toWeb(child.stdout) as ReadableStream<Uint8Array>,
    ),
  );
  const failed = (error: Error) => {
    requests.cancel();
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
        clientInfo: { name: "startup-os", version: "1.0.0" },
      },
      { cancellationSignal: AbortSignal.timeout(30_000), stopWaitingOnCancel: true },
    );
    const mcpServers: McpServer[] = context.lease
      ? [
          {
            type: "http",
            name: "startup-os",
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
      const session = await connection.agent.request(
        "session/new",
        { cwd: context.directory, mcpServers },
        { cancellationSignal: AbortSignal.timeout(30_000), stopWaitingOnCancel: true },
      );
      nativeSessionId = session.sessionId;
    }
    if (context.agent.model)
      await connection.agent.request(
        "session/set_config_option",
        { sessionId: nativeSessionId, configId: "model", value: context.agent.model },
        { cancellationSignal: AbortSignal.timeout(30_000), stopWaitingOnCancel: true },
      );
    return {
      nativeSessionId,
      async prompt(text) {
        const result = await connection.agent.request("session/prompt", {
          sessionId: nativeSessionId,
          prompt: [{ type: "text", text }],
        });
        context.emit({
          type: "turn-completed",
          status: result.stopReason === "cancelled" ? "interrupted" : "completed",
        });
      },
      async interrupt() {
        requests.cancel();
        await connection.agent.notify("session/cancel", { sessionId: nativeSessionId });
      },
      async respond(id, response) {
        requests.respond(id, response);
      },
      async disconnect() {
        requests.cancel();
        connection.close();
        await stopProcess(child);
      },
    };
  } catch (error) {
    requests.cancel();
    connection.close();
    await stopProcess(child);
    throw error;
  }
}
