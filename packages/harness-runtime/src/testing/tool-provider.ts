import type {
  JsonObject,
  ToolCall,
  ToolCallResult,
  ToolOutputPolicy,
  ToolProvider,
} from "@substrate/contracts/harness-runtime";

import { z } from "zod";

/** The binding of the test provider: a turn and its attempt, as a host would bind them. */
const testBinding = z.strictObject({ turnId: z.string(), attempt: z.number().int() });
export type TestBinding = z.infer<typeof testBinding>;

const tool = (
  title: string,
  input: z.ZodType<JsonObject>,
  flags: { readOnly?: boolean; destructive?: boolean } = {},
) => ({
  title,
  description: `${title}.`,
  input,
  readOnly: flags.readOnly ?? false,
  destructive: flags.destructive ?? false,
  idempotent: flags.readOnly ?? false,
});

/** A small catalog whose tools exercise each result path of the runtime. */
const tools = {
  list_projects: tool(
    "List projects",
    z.strictObject({ limit: z.number().int().max(100).default(25) }),
    { readOnly: true },
  ),
  delete_project: tool("Delete project", z.strictObject({ projectId: z.string() }), {
    destructive: true,
  }),
  read_file: tool("Read file", z.strictObject({ file: z.string() }), { readOnly: true }),
  download_file: tool("Download file", z.strictObject({ file: z.string() }), { readOnly: true }),
  read_private: tool("Read private", z.strictObject({ id: z.string() }), { readOnly: true }),
  read_archive: tool("Read archive", z.strictObject({ id: z.string() }), { readOnly: true }),
};
const catalog = new Map(Object.entries(tools));

const policies = new Map<string, ToolOutputPolicy>([
  ["read_private", "turn-only"],
  ["read_archive", "inline"],
]);

export const testServer = {
  name: "workspace",
  version: "1.0.0",
  instructions: "Use your harness's tool discovery and load the skills you need.",
};

/** The hint the test provider gives for an error code. */
export const testHint = (code: string) => `Next step for ${code}.`;

type Handle = (call: ToolCall<TestBinding>) => Promise<ToolCallResult>;

/** A provider that records calls and answers them with handle. */
export function testToolProvider(
  handle: Handle = async () => ({ success: true, data: { items: [], nextCursor: null } }),
) {
  const calls: ToolCall<TestBinding>[] = [];
  const provider: ToolProvider<TestBinding> = {
    server: testServer,
    pagingFields: ["nextCursor", "nextBefore"],
    describe: (name) => catalog.get(name),
    bind(context, turnId) {
      const binding = testBinding.parse(context);
      if (binding.turnId !== turnId) throw new Error("Another turn.");
      return binding;
    },
    async call(call) {
      calls.push(call);
      return handle(call);
    },
    outputPolicy: (name) => policies.get(name) ?? "offload",
    errorHint: testHint,
  };
  return { provider, calls };
}
