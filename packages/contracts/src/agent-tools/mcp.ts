import { localToolCall, mcpCall } from "./tools/index.ts";
import { z } from "zod";

export { turnContextSchema, type TurnContext } from "./turn-context.ts";

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
