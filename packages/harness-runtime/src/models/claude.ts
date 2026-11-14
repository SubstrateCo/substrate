import { query, type SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";

export async function discoverClaudeModels(
  executable: string,
  directory: string,
  signal: AbortSignal,
) {
  signal.throwIfAborted();
  let finish: () => void = () => {};
  const held = new Promise<void>((resolve) => {
    finish = resolve;
  });
  // Initialize the SDK for metadata without ever sending a prompt: the stream ends when released.
  const noPrompts: AsyncIterable<SDKUserMessage> = {
    [Symbol.asyncIterator]: () => ({
      next: async () => {
        await held;
        return { done: true, value: undefined };
      },
    }),
  };
  const abortController = new AbortController();
  const abort = () => abortController.abort();
  signal.addEventListener("abort", abort, { once: true });
  const probe = query({
    prompt: noPrompts,
    options: {
      cwd: directory,
      pathToClaudeCodeExecutable: executable,
      settingSources: ["user", "project", "local"],
      persistSession: false,
      tools: [],
      abortController,
    },
  });
  try {
    const models = await probe.supportedModels();
    return models.map((model) => ({
      id: model.value,
      name: model.displayName,
      description: model.description,
    }));
  } finally {
    signal.removeEventListener("abort", abort);
    finish();
    probe.close();
  }
}
