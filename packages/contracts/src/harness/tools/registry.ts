import { appEnabled, type AppId } from "../../apps/index.ts";
import { turnContextSchema } from "../turn-context.ts";
import { contextTools } from "./context.ts";
import { crmTools } from "./crm.ts";
import { linkTools } from "./links.ts";
import { localTools } from "./local.ts";
import { messagingTools } from "./messaging.ts";
import type { ToolDefinition } from "./shared.ts";
import { taskTools } from "./tasks.ts";
import { z } from "zod";

/** server: the workspace API executes the call. local: the home desktop handles it. */
export type ToolScope = "server" | "local";

const serverTools = {
  ...required(crmTools, ["crm"]),
  ...contextTools,
  ...required(taskTools, ["tasks"]),
  ...messagingTools,
  ...linkTools,
} as const satisfies Record<string, ToolDefinition>;

function required<T extends Record<string, ToolDefinition>>(tools: T, apps: readonly AppId[]) {
  // SAFETY: this adds app metadata without changing any tool's schemas.
  return Object.fromEntries(
    Object.entries(tools).map(([name, tool]) => [
      name,
      { ...tool, requiredApps: name === "create_crm_follow_up" ? ["crm", "tasks"] : apps },
    ]),
  ) as { [K in keyof T]: T[K] & { requiredApps: readonly AppId[] } };
}

type Scoped<T, S extends ToolScope> = { [K in keyof T]: T[K] & { scope: S } };
function scoped<T extends Record<string, ToolDefinition>, S extends ToolScope>(
  tools: T,
  scope: S,
): Scoped<T, S> {
  // SAFETY: each entry is copied with only the scope field added, which is what Scoped<T, S> describes.
  return Object.fromEntries(
    Object.entries(tools).map(([name, tool]) => [name, { ...tool, scope }]),
  ) as Scoped<T, S>;
}

export const mcpTools = {
  ...scoped(serverTools, "server"),
  ...scoped(localTools satisfies Record<string, ToolDefinition>, "local"),
};

export type McpToolName = keyof typeof mcpTools;
export type ServerToolName = keyof typeof serverTools;
export type LocalToolName = keyof typeof localTools;
export type McpInput<K extends McpToolName> = z.output<(typeof mcpTools)[K]["input"]>;
export type McpOutput<K extends McpToolName> = z.output<(typeof mcpTools)[K]["output"]>;

// SAFETY: these keys come directly from the nonempty tool registries above.
const serverToolName = z.enum(Object.keys(serverTools) as [ServerToolName, ...ServerToolName[]]);
// SAFETY: these keys come directly from the nonempty local tool registry.
const localToolName = z.enum(Object.keys(localTools) as [LocalToolName, ...LocalToolName[]]);

const call = {
  input: z.record(z.string(), z.json()),
  organizationId: z.string().min(1),
  agentId: z.uuid(),
  turn: turnContextSchema,
};
/** A server tool call. The host supplies scope and turn from the live per-turn MCP lease. */
export const mcpCall = z.object({ tool: serverToolName, ...call }).strict();
/** A local tool call, routed from the harness worker to the desktop's agent-work handler. */
export const localToolCall = z
  .object({ tool: localToolName, sessionId: z.string().min(1).max(200), ...call })
  .strict();

/** Server tools only the main session may call: helpers report through finish_helper instead. */
const mainOnlyServerTools: ReadonlySet<string> = new Set(["reply", "propose"]);

/** Tools offered on a lease. Helper sessions cannot publish, manage helpers, or edit memory. */
export function leaseTools(
  session: "main" | "helper",
  enabledApps: readonly AppId[] = [],
): McpToolName[] {
  // SAFETY: Object.keys reads the statically defined registry above.
  return (Object.keys(mcpTools) as McpToolName[]).filter((name) => {
    if (!toolApps(name).every((app) => appEnabled(enabledApps, app))) return false;
    if (session === "main") return name !== "finish_helper";
    return mcpTools[name].scope === "server"
      ? !mainOnlyServerTools.has(name)
      : name === "finish_helper";
  });
}

export function toolApps(name: McpToolName): readonly AppId[] {
  const definition: ToolDefinition = mcpTools[name];
  return definition.requiredApps ?? [];
}
