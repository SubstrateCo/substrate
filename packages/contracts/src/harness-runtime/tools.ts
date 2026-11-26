import { z } from "zod";

const jsonValue = z.json();
export type JsonValue = z.infer<typeof jsonValue>;
/** A JSON object, such as a tool call's parsed input or its result data. */
export type JsonObject = { [field: string]: JsonValue };

/** MCP results larger than this are written to the agent folder and returned as a reference. */
export const mcpOutputOffloadBytes = 8 * 1024;
export const offloadedOutput = z.object({
  summary: z.string(),
  truncated: z.literal(true),
  path: z.string(),
  bytes: z.number().int(),
});
export type OffloadedOutput = z.infer<typeof offloadedOutput>;

/** The host MCP server as native agents see it. */
export interface ToolServerIdentity {
  name: string;
  version: string;
  instructions: string;
}

/** A host tool as the runtime's MCP servers offer it. */
export interface ToolDescriptor {
  title: string;
  description: string;
  /** Both MCP servers validate call input with it before the provider receives the call. */
  input: z.ZodType<JsonObject>;
  readOnly: boolean;
  destructive: boolean;
  idempotent: boolean;
}

/**
 * What the runtime may do with a successful result.
 * offload: inline when small, else written to the session folder and returned as a reference.
 * inline: always inline, never written to the session folder.
 * turn-only: inline only while the call's turn is still bound and the result is small; else the
 * call fails. Never written to the session folder.
 */
export type ToolOutputPolicy = "offload" | "inline" | "turn-only";

/** One tool call on a session's lease, during a bound turn. */
export interface ToolCall<Binding> {
  tool: string;
  /** The output of the tool's input schema. */
  input: JsonObject;
  organizationId: string;
  agentId: string;
  /** The runtime session that owns the lease. */
  sessionId: string;
  /** What the provider's bind returned for the turn. */
  binding: Binding;
}

export type ToolCallResult =
  | {
      success: false;
      /** Returned to the agent with the provider's hint for the code. */
      error: { code: string; message: string; [field: string]: JsonValue };
    }
  | {
      success: true;
      data: JsonObject;
      /** An image the model sees as an image block after data. The result stays inline. */
      image?: { data: string; mimeType: string };
      /**
       * File bytes the runtime writes to the session folder instead of the model's context. The
       * agent receives data with the file's relative path.
       */
      download?: { id: string; filename: string; base64: string };
    };

/**
 * The host's tools. The runtime serves them on each session's MCP lease, binds one turn at a
 * time, and keeps their names, results and errors opaque.
 */
export interface ToolProvider<Binding = unknown> {
  readonly server: ToolServerIdentity;
  /** Result fields that say whether a list page has more. Offload summaries name them. */
  readonly pagingFields: readonly string[];
  /** The tool's MCP description, or undefined for a name the provider does not know. */
  describe(tool: string): ToolDescriptor | undefined;
  /** Validates a turn command's context for the turn. Throws when it does not belong to it. */
  bind(context: JsonValue, turnId: string): Binding;
  /** Runs one call. A thrown error reaches the agent as an unavailable operation. */
  call(call: ToolCall<Binding>): Promise<ToolCallResult>;
  outputPolicy(tool: string): ToolOutputPolicy;
  /** What the agent should do next after an error with this code, also for unknown codes. */
  errorHint(code: string): string;
}
