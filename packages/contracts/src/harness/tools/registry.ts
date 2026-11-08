import { contextTools } from "./context.ts";
import { linkTools } from "./links.ts";
import { messagingTools } from "./messaging.ts";
import type { ToolDefinition } from "./shared.ts";
import { taskTools } from "./tasks.ts";
import { z } from "zod";

export const mcpTools = {
  ...contextTools,
  ...taskTools,
  ...messagingTools,
  ...linkTools,
} as const satisfies Record<string, ToolDefinition>;

export type McpToolName = keyof typeof mcpTools;
export type McpInput<K extends McpToolName> = z.output<(typeof mcpTools)[K]["input"]>;
export type McpOutput<K extends McpToolName> = z.output<(typeof mcpTools)[K]["output"]>;
// SAFETY: these keys come directly from the nonempty tool registry above.
const mcpToolName = z.enum(Object.keys(mcpTools) as [McpToolName, ...McpToolName[]]);
export const mcpCall = z
  .object({
    tool: mcpToolName,
    input: z.record(z.string(), z.json()),
    organizationId: z.string().min(1),
    agentId: z.uuid(),
  })
  .strict();
