import { nativeName } from "../config.ts";
import { HarnessError } from "../errors.ts";
import { launch, stopProcess } from "../process.ts";
import type { AdapterContext, NativeAdapter } from "./types.ts";
import { OpenCode } from "@opencode/client";
import { randomBytes } from "node:crypto";

/* oxlint-disable deslop/no-runtime-typeof -- Host form responses and the native endpoint announcement are validated at this I/O boundary. */

export function openCodeModel(value?: string): { providerID: string; id: string } | undefined {
  if (!value) return undefined;
  const index = value.indexOf("/");
  if (index <= 0 || index === value.length - 1)
    throw new HarnessError("invalid-model", "OpenCode models use provider/model IDs.");
  return { providerID: value.slice(0, index), id: value.slice(index + 1) };
}

export async function connectOpenCode(
  context: AdapterContext,
  resumeId?: string,
): Promise<NativeAdapter> {
  const agent = nativeName(context.agent.id);
  const config = {
    agents: {
      [agent]: {
        description: context.agent.name,
        mode: "primary",
        system: context.agent.instructions,
      },
    },
    mcp: context.lease
      ? {
          servers: {
            "startup-os": {
              type: "remote",
              url: context.lease.url,
              oauth: false,
              headers: { Authorization: "Bearer {env:STARTUP_OS_MCP_TOKEN}" },
            },
          },
        }
      : undefined,
  };
  const password = randomBytes(32).toString("hex");
  // --stdio emits the private endpoint and couples the server to its parent pipe.
  // This never discovers, reconfigures, or stops the user's shared service.
  const child = launch(
    context.executable,
    ["serve", "--stdio", "--hostname", "127.0.0.1", "--port", "0"],
    context.directory,
    {
      OPENCODE_SERVER_PASSWORD: password,
      OPENCODE_CONFIG_CONTENT: JSON.stringify(config),
      STARTUP_OS_MCP_TOKEN: context.lease?.token,
    },
  );
  child.stderr.resume();
  const controller = new AbortController();
  let eventLoop: Promise<void> | undefined;
  async function stop() {
    controller.abort();
    await eventLoop?.catch(() => {});
    await stopProcess(child);
  }
  try {
    const baseUrl = await new Promise<string>((resolve, reject) => {
      let buffer = "";
      const timer = setTimeout(
        () =>
          reject(
            new HarnessError("process-timeout", "OpenCode server did not announce its endpoint."),
          ),
        30_000,
      );
      const fail = () => {
        clearTimeout(timer);
        reject(
          new HarnessError(
            "process-exit",
            "OpenCode server stopped before announcing its endpoint.",
          ),
        );
      };
      child.once("error", fail);
      child.once("exit", fail);
      child.stdout.on("data", (chunk: Buffer) => {
        buffer += chunk.toString();
        if (buffer.length > 65536) {
          clearTimeout(timer);
          reject(
            new HarnessError("protocol-limit", "OpenCode startup output exceeded the size limit."),
          );
          return;
        }
        const newline = buffer.indexOf("\n");
        if (newline < 0) return;
        clearTimeout(timer);
        try {
          // SAFETY: the URL is validated below before any request or credential is sent to it.
          const endpoint = JSON.parse(buffer.slice(0, newline)) as { url: string };
          const url = new URL(endpoint.url);
          if (
            url.protocol !== "http:" ||
            url.hostname !== "127.0.0.1" ||
            url.username ||
            url.password ||
            url.pathname !== "/"
          )
            throw new Error("Invalid endpoint");
          resolve(endpoint.url);
        } catch {
          reject(
            new HarnessError(
              "invalid-endpoint",
              "OpenCode did not announce a safe loopback endpoint.",
            ),
          );
        }
      });
    });
    const client = OpenCode.make({
      baseUrl,
      headers: { authorization: `Basic ${Buffer.from(`opencode:${password}`).toString("base64")}` },
    });
    const session = resumeId
      ? await client.session.get({ sessionID: resumeId })
      : await client.session.create({
          location: { directory: context.directory },
          agent,
          model: openCodeModel(context.agent.model),
        });
    if (session.location.directory !== context.directory)
      throw new HarnessError(
        "session-boundary",
        "Native OpenCode session belongs to another directory.",
      );
    const nativeSessionId = session.id;
    const requests = new Map<string, "permission" | "input">();
    let connected: () => void = () => {};
    let rejectConnected: (error: Error) => void = () => {};
    const ready = new Promise<void>((resolve, reject) => {
      connected = resolve;
      rejectConnected = reject;
    });
    eventLoop = (async () => {
      try {
        for await (const event of client.event.subscribe({ signal: controller.signal })) {
          if (event.type === "server.connected") {
            connected();
            continue;
          }
          if (event.type === "form.created") {
            if (event.data.form.sessionID !== nativeSessionId) continue;
            requests.set(event.data.form.id, "input");
            context.emit({
              type: "request",
              requestId: event.data.form.id,
              kind: "input",
              data: event.data.form,
            });
            continue;
          }
          if (!("sessionID" in event.data) || event.data.sessionID !== nativeSessionId) continue;
          if (event.type === "session.text.delta")
            context.emit({ type: "text", text: event.data.delta, delta: true });
          else if (event.type === "permission.asked") {
            requests.set(event.data.id, "permission");
            context.emit({
              type: "request",
              requestId: event.data.id,
              kind: "permission",
              data: event.data,
            });
          } else if (
            event.type === "session.execution.succeeded" ||
            event.type === "session.execution.failed" ||
            event.type === "session.execution.interrupted"
          ) {
            let status: "completed" | "interrupted" | "failed" = "failed";
            if (event.type === "session.execution.succeeded") status = "completed";
            else if (event.type === "session.execution.interrupted") status = "interrupted";
            context.emit({ type: "turn-completed", status });
          } else context.emit({ type: "activity", name: event.type, data: event.data });
        }
      } catch (error) {
        rejectConnected(
          new HarnessError("event-stream", "OpenCode event stream failed.", { cause: error }),
        );
        if (!controller.signal.aborted)
          context.emit({
            type: "error",
            code: "event-stream",
            message: "OpenCode event stream ended. Disconnect and resume to reconnect.",
          });
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
    return {
      nativeSessionId,
      async prompt(text) {
        await client.session.prompt({ sessionID: nativeSessionId, text });
        await client.session.wait({ sessionID: nativeSessionId });
      },
      async interrupt() {
        await client.session.interrupt({ sessionID: nativeSessionId });
      },
      async respond(requestId, response) {
        const kind = requests.get(requestId);
        if (!kind) throw new HarnessError("unknown-request", "Unknown native request.");
        if (kind === "permission") {
          if (response !== "once" && response !== "always" && response !== "reject")
            throw new HarnessError(
              "invalid-response",
              "OpenCode permission accepts once, always, or reject.",
            );
          await client.permission.reply({
            sessionID: nativeSessionId,
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
          await client.session.form.reply({
            sessionID: nativeSessionId,
            formID: requestId,
            answer: response as Record<string, string | number | boolean | string[]>,
          });
        }
        requests.delete(requestId);
      },
      async disconnect() {
        requests.clear();
        await stop();
      },
    };
  } catch (error) {
    await stop();
    throw error;
  }
}
