import { HelperLimitError } from "@startup-os/client-storage/agent-work";
import { localToolRequest, type WorkspaceApiResult } from "@startup-os/contracts/harness/mcp";
import { mcpTools, type LocalToolName, type McpOutput } from "@startup-os/contracts/harness/tools";

import type { RuntimeContext } from "../runtime/context.ts";
import type { Steering } from "../runtime/steering.ts";
import type { TurnExecutor } from "../runtime/turn-executor.ts";

/* oxlint-disable deslop/no-unknown-parameters -- Local tool calls arrive unparsed from the harness worker and are parsed here. */

class ToolError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

/**
 * Local MCP tools the desktop runs itself: save_handoff and the helper tools. The call must come
 * from a live turn of the session it names, for the organization and agent of that session.
 */
export function createLocalTools(
  context: RuntimeContext,
  deps: { executor: TurnExecutor; steering: Steering },
) {
  async function session(request: ReturnType<typeof localToolRequest.parse>) {
    const row = await context.store.sessions.get(request.sessionId);
    const live = deps.executor.live.get(request.turn.turnId);
    const inScope =
      row?.organizationId === context.organizationId &&
      request.organizationId === context.organizationId &&
      row.userAgentId === request.agentId;
    const fromLiveTurn = live !== undefined && live.sessionId === row?.id;
    if (!row || !inScope || !fromLiveTurn)
      throw new ToolError("FORBIDDEN", "This tool call does not belong to a live turn.");
    return row;
  }

  async function helperOf(parentSessionId: string, helperId: string) {
    const helper = await context.store.helpers.get(helperId);
    if (!helper || helper.parentSessionId !== parentSessionId)
      throw new ToolError("NOT_FOUND", "No such helper in this session.");
    return helper;
  }

  function liveHelperTurn(helperId: string) {
    return [...deps.executor.live.values()].find(
      (state) => state.folderKey === `helper:${helperId}`,
    );
  }

  async function run(
    request: ReturnType<typeof localToolRequest.parse>,
  ): Promise<McpOutput<LocalToolName>> {
    const current = await session(request);
    const now = context.now();
    switch (request.tool) {
      case "save_handoff": {
        const input = mcpTools.save_handoff.input.parse(request.input);
        await context.store.epochs.saveHandoff(current.id, current.epoch, input, now);
        return { saved: true };
      }
      case "start_helper": {
        if (current.kind === "helper")
          throw new ToolError("FORBIDDEN", "Helpers cannot start helpers.");
        const input = mcpTools.start_helper.input.parse(request.input);
        const helper = await context.store.helpers.start(current.id, input, now);
        context.changed({ userAgentId: current.userAgentId });
        return { helperId: helper.id, status: helper.status };
      }
      case "list_helpers": {
        mcpTools.list_helpers.input.parse(request.input);
        return {
          items: (await context.store.helpers.list(current.id)).map((helper) => ({
            helperId: helper.id,
            task: helper.task,
            status: helper.status,
            report: helper.report,
            createdAt: new Date(helper.createdAt).toISOString(),
          })),
        };
      }
      case "message_helper": {
        const input = mcpTools.message_helper.input.parse(request.input);
        await helperOf(current.id, input.helperId);
        const item = await context.store.helpers.message(input.helperId, input.text, now);
        const live = liveHelperTurn(input.helperId);
        if (live?.capabilities.steer) {
          const steered = await deps.steering
            .steerInput(live, item.id, input.text)
            .catch(() => false);
          if (steered) return { delivered: "steered" };
        }
        context.changed({ userAgentId: current.userAgentId });
        return { delivered: "queued" };
      }
      case "stop_helper": {
        const input = mcpTools.stop_helper.input.parse(request.input);
        await helperOf(current.id, input.helperId);
        const helper = await context.store.helpers.stop(input.helperId, now);
        const live = liveHelperTurn(input.helperId);
        if (live) await deps.steering.stop(live.turnId);
        return { helperId: helper.id, status: helper.status };
      }
      case "finish_helper": {
        if (current.kind !== "helper") throw new ToolError("FORBIDDEN", "Only helpers can finish.");
        const input = mcpTools.finish_helper.input.parse(request.input);
        await context.store.helpers.finish(current.id, input.report, now);
        context.changed({ userAgentId: current.userAgentId });
        return { saved: true };
      }
      case "remember":
      case "forget":
        // Memory files belong to the harness worker, which owns the agent folders.
        throw new ToolError("UNSUPPORTED", "Memory tools are handled by the harness host.");
    }
  }

  return async function handle(raw: unknown): Promise<WorkspaceApiResult> {
    const parsed = localToolRequest.safeParse(raw);
    if (!parsed.success)
      return { success: false, error: { code: "INVALID_INPUT", message: "Invalid tool call." } };
    try {
      // SAFETY: tool results are plain JSON objects built above.
      return { success: true, data: (await run(parsed.data)) as never };
    } catch (error) {
      if (error instanceof ToolError || error instanceof HelperLimitError)
        return {
          success: false,
          error: {
            code: error instanceof ToolError ? error.code : "LIMIT",
            message: error.message,
          },
        };
      return {
        success: false,
        error: { code: "INVALID_INPUT", message: "The tool input is not valid." },
      };
    }
  };
}
export type LocalToolHandler = ReturnType<typeof createLocalTools>;
