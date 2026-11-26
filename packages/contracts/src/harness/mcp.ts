import { localToolCall, mcpCall } from "./tools/index.ts";
import { z } from "zod";

export { turnContextSchema, turnKinds, type TurnContext, type TurnKind } from "./turn-context.ts";

// The host supplies agent, organization and turn scope from a live per-turn MCP lease, not tool input.
export const workspaceApiRequest = mcpCall;
export type WorkspaceApiRequest = z.infer<typeof workspaceApiRequest>;
export const workspaceApiResult = z.discriminatedUnion("success", [
  z.object({ success: z.literal(true), data: z.json() }),
  z.object({
    success: z.literal(false),
    error: z.object({
      code: z.string(),
      message: z.string(),
      /** APPROVAL_PENDING only: the proposal request that waits for the owner. */
      requestId: z.string().optional(),
    }),
  }),
]);
export type WorkspaceApiResult = z.infer<typeof workspaceApiResult>;
export type WorkspaceApiProxy = (request: WorkspaceApiRequest) => Promise<WorkspaceApiResult>;

/** Local tools return the same result shape as workspace calls. */
export const localToolRequest = localToolCall;
export type LocalToolRequest = z.infer<typeof localToolRequest>;
export type LocalToolProxy = (request: LocalToolRequest) => Promise<WorkspaceApiResult>;

/** MCP results larger than this are written to the agent folder and returned as a reference. */
export const mcpOutputOffloadBytes = 8 * 1024;
export const offloadedOutput = z.object({
  summary: z.string(),
  truncated: z.literal(true),
  path: z.string(),
  bytes: z.number().int(),
});
export type OffloadedOutput = z.infer<typeof offloadedOutput>;
