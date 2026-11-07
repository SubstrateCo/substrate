import { startOpenCode } from "../adapters/opencode-client.ts";
import { openCodeModels } from "./catalog.ts";

export async function discoverOpenCodeModels(
  executable: string,
  directory: string,
  signal: AbortSignal,
) {
  const { client, close } = await startOpenCode(executable, directory, {}, signal);
  try {
    const location = { directory };
    const [models, providers, defaultModel] = await Promise.all([
      client.model.list({ location, types: ["chat"] }, { signal }),
      client.provider.list({ location }, { signal }),
      client.model.default({ location }, { signal }),
    ]);
    return openCodeModels(models.data, providers.data, defaultModel.data);
  } finally {
    await close();
  }
}
