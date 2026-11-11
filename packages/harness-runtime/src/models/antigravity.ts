import { launch, stopProcess } from "../process.ts";
import { acpModels } from "./catalog.ts";
import { client, ndJsonStream, PROTOCOL_VERSION } from "@agentclientprotocol/sdk";
import { Readable, Writable } from "node:stream";

export async function discoverAntigravityModels(
  executable: string,
  directory: string,
  signal: AbortSignal,
) {
  signal.throwIfAborted();
  const child = launch(executable, ["acp", "--process-per-session"], directory);
  const app = client().onRequest("session/request_permission", async () => ({
    outcome: { outcome: "cancelled" },
  }));
  // SAFETY: piped Node stdout emits Uint8Array; only the ambient DOM stream type differs.
  const connection = app.connect(
    ndJsonStream(
      Writable.toWeb(child.stdin),
      Readable.toWeb(child.stdout) as ReadableStream<Uint8Array>,
    ),
  );
  child.stderr.resume();
  child.on("error", () => connection.close());
  child.on("exit", () => connection.close());
  const abort = () => {
    connection.close();
    void stopProcess(child);
  };
  signal.addEventListener("abort", abort, { once: true });
  try {
    const options = { cancellationSignal: signal, stopWaitingOnCancel: true };
    await connection.agent.request(
      "initialize",
      {
        protocolVersion: PROTOCOL_VERSION,
        clientCapabilities: {},
        clientInfo: { name: "substrate", version: "1.0.0" },
      },
      options,
    );
    const session = await connection.agent.request(
      "session/new",
      { cwd: directory, mcpServers: [] },
      options,
    );
    return acpModels(session);
  } finally {
    signal.removeEventListener("abort", abort);
    connection.close();
    await stopProcess(child);
  }
}
