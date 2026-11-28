import { approvalPendingCode } from "../agent-work/proposals.ts";
import { substrateMcpServerId } from "../harness-runtime/local.ts";
import type { ToolCallResult, ToolProvider } from "../harness-runtime/tools.ts";
import type { LocalToolProxy, WorkspaceApiProxy, WorkspaceApiResult } from "./mcp.ts";
import {
  mcpTools,
  type LocalToolName,
  type McpToolName,
  type ToolDefinition,
} from "./tools/index.ts";
import { turnContextSchema, type TurnContext } from "./turn-context.ts";
import type { z } from "zod";

const server = {
  name: substrateMcpServerId,
  version: "1.0.0",
  instructions:
    "Substrate connects workspace search, messages, and the workspace apps that are enabled. Apps are optional, and each one adds its own tools. " +
    "Use your harness's tool discovery to discover relevant operations when their schemas are not loaded, and load a tool's schema before its first call instead of guessing arguments; " +
    "do not assume a capability is unavailable just because its tool is not listed in context. " +
    "Load the relevant domain skills for workflow guidance. Only tools offered to this session are available; " +
    "discovery does not grant record access or permission to write.",
};

// oxlint-disable-next-line deslop/prefer-literal-union -- Workspace errors use an open string code; unknown codes need the default hint.
function errorHint(code: string) {
  switch (code) {
    case "NOT_FOUND":
      return "The record does not exist or you cannot access it. Find IDs with search or a list tool; do not guess IDs.";
    case "INVALID_INPUT":
      return "Correct the input as the message says, then retry.";
    case "CONFLICT":
      return "This requestId was already used with different input. Use a new requestId for a new action.";
    case "UNAUTHENTICATED":
    case "FORBIDDEN":
      return "Stop. Tell your owner to sign in to Substrate in this workspace and start a new run.";
    case "NO_TURN":
      return "Do not retry. Substrate tools work only while a turn is running.";
    case "APP_DISABLED":
      return "Stop this workflow. Do not retry or use another tool to bypass the disabled app. Tell your owner the app must be enabled first.";
    case "DECLINED":
      return "Do not retry this call or work around it. Continue with other work or tell your owner what you could not do.";
    case "FAILED":
      return "Your owner approved this call, but it failed as the message says. Do not retry it on your own; tell your owner.";
    case "RESULT_UNAVAILABLE":
      return "The call ran. Do not retry it. Read the record again before you continue.";
    case approvalPendingCode:
      return "Do not retry or work around it. Your owner approves or declines this exact call; the result arrives as a new item in a later turn. Continue with other work or end your turn.";
    default:
      return "Retry once. If it fails again, stop and report the error to your owner.";
  }
}

function isToolName(name: string): name is McpToolName {
  return Object.hasOwn(mcpTools, name);
}

function isLocalTool(name: McpToolName): name is LocalToolName {
  return mcpTools[name].scope === "local";
}

function downloadToSessionFolder(
  data: z.output<typeof mcpTools.download_file.output>,
): ToolCallResult {
  const { data: base64, ...file } = data;
  return {
    success: true,
    data: file,
    download: { id: file.file.attachmentId, filename: file.filename, base64 },
  };
}

function imageBlock(read: z.output<typeof mcpTools.read_file.output>): ToolCallResult | undefined {
  if (read.content.kind !== "image") return undefined;
  const { data: image, mimeType } = read.content;
  return {
    success: true,
    data: { ...read, content: { kind: "image", mimeType } },
    image: { data: image, mimeType },
  };
}

export interface AgentToolHandlers {
  /** Receives server tool calls. */
  workspace?: WorkspaceApiProxy;
  /** Receives local tool calls. */
  local?: LocalToolProxy;
}

/** Substrate's tools for the harness runtime. A turn binds its server TurnContext. */
export function agentToolProvider(handlers: AgentToolHandlers = {}): ToolProvider<TurnContext> {
  return {
    server,
    pagingFields: ["nextCursor", "nextBefore", "nextAfterEntityId"],
    describe(name) {
      if (!isToolName(name)) return undefined;
      const tool: ToolDefinition = mcpTools[name];
      return {
        title: tool.title,
        description: tool.description,
        input: tool.input,
        readOnly: tool.readOnly,
        destructive: tool.destructive ?? false,
        idempotent: tool.readOnly || (tool.idempotent ?? false),
      };
    },
    bind(context, turnId) {
      const turn = turnContextSchema.parse(context);
      if (turn.turnId !== turnId) throw new Error("Turn context belongs to another turn.");
      return turn;
    },
    async call({ tool, input, organizationId, agentId, sessionId, binding: turn }) {
      if (!isToolName(tool)) throw new Error("Unknown tool");
      let result: WorkspaceApiResult;
      if (isLocalTool(tool)) {
        if (!handlers.local) throw new Error("Local tools unavailable");
        result = await handlers.local({ tool, sessionId, organizationId, agentId, turn, input });
      } else {
        if (!handlers.workspace) throw new Error("Workspace API unavailable");
        result = await handlers.workspace({ tool, organizationId, agentId, turn, input });
      }
      if (!result.success) return { success: false, error: result.error };
      const data = mcpTools[tool].output.parse(result.data);
      if (tool === "download_file")
        return downloadToSessionFolder(mcpTools.download_file.output.parse(data));
      if (tool === "read_file")
        return imageBlock(mcpTools.read_file.output.parse(data)) ?? { success: true, data };
      return { success: true, data };
    },
    outputPolicy(name) {
      if (!isToolName(name)) return "offload";
      const tool: ToolDefinition = mcpTools[name];
      return tool.outputPolicy ?? "offload";
    },
    errorHint,
  };
}
