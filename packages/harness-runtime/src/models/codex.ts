import { JsonLineRpc } from "../adapters/json-rpc.ts";
import { launch, stopProcess } from "../process.ts";
import { codexModels } from "./catalog.ts";

export async function discoverCodexModels(
  executable: string,
  directory: string,
  signal: AbortSignal,
) {
  signal.throwIfAborted();
  const child = launch(executable, ["app-server"], directory);
  const rpc = new JsonLineRpc(child, (message) => {
    if (message.method && message.id !== undefined)
      rpc.send({
        id: message.id,
        error: { code: -32601, message: "Model discovery cannot answer requests." },
      });
  });
  const abort = () => rpc.close();
  signal.addEventListener("abort", abort, { once: true });
  try {
    await rpc.request("initialize", {
      clientInfo: { name: "startup_os", title: "Startup OS", version: "1.0.0" },
      capabilities: { experimentalApi: true },
    });
    rpc.send({ method: "initialized", params: {} });
    return await codexModels((cursor) => rpc.request("model/list", cursor ? { cursor } : {}));
  } finally {
    signal.removeEventListener("abort", abort);
    rpc.close();
    await stopProcess(child);
  }
}
