import { mcpCall } from "./tools.ts";
import { z } from "zod";

// The host supplies agent and organization scope from a live MCP lease, not tool input.
export const workspaceApiRequest = mcpCall;
export type WorkspaceApiRequest = z.infer<typeof workspaceApiRequest>;
export const workspaceApiResult = z.discriminatedUnion("success", [
  z.object({ success: z.literal(true), data: z.json() }),
  z.object({
    success: z.literal(false),
    error: z.object({ code: z.string(), message: z.string() }),
  }),
]);
export type WorkspaceApiResult = z.infer<typeof workspaceApiResult>;
export type WorkspaceApiProxy = (request: WorkspaceApiRequest) => Promise<WorkspaceApiResult>;
