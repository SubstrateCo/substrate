import type { LocalToolRequest, WorkspaceApiResult } from "@substrate/contracts/agent-tools/mcp";
import { mcpTools } from "@substrate/contracts/agent-tools/tools";

import type { LiveTurn, RuntimeContext } from "../runtime/context.ts";
import { runPrivateInbox } from "../runtime/private-inbox.ts";
import type { TurnExecutor } from "../runtime/turn-executor.ts";
import { InboxToolError } from "../tools/inbox-error.ts";

class ToolError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

/**
 * Dispatch the tools this host runs itself: the private inbox and the epoch handoff. The call
 * must come from the live server turn and attempt it names, in the session, organization and
 * agent of that turn.
 */
export function createLocalTools(context: RuntimeContext, deps: { executor: TurnExecutor }) {
  function liveTurn(request: LocalToolRequest): LiveTurn {
    const live = deps.executor.live.get(request.turn.turnId);
    const sameAttempt = live?.attempt === request.turn.attempt && !live.released;
    const sameScope =
      live?.sessionId === request.sessionId &&
      live.userAgentId === request.agentId &&
      request.organizationId === context.organizationId;
    if (!live || !sameAttempt || !sameScope)
      throw new ToolError("FORBIDDEN", "This tool call does not belong to a live turn.");
    return live;
  }

  async function run(request: LocalToolRequest) {
    const live = liveTurn(request);
    switch (request.tool) {
      case "search_inbox":
      case "read_inbox_message":
        return runPrivateInbox(context, request, () => deps.executor.live.get(live.turnId));
      case "save_handoff": {
        const input = mcpTools.save_handoff.input.parse(request.input);
        await context.store.handoffs.save(
          context.organizationId,
          live.sessionId,
          live.epoch,
          input,
          context.now(),
        );
        return { saved: true };
      }
      default:
        throw new ToolError("UNAVAILABLE", "This tool does not run on this desktop.");
    }
  }

  /** The harness controller parses the call before it reaches this handler. */
  return async function handle(request: LocalToolRequest): Promise<WorkspaceApiResult> {
    try {
      // SAFETY: tool results are plain JSON objects built above.
      return { success: true, data: (await run(request)) as never };
    } catch (error) {
      if (error instanceof ToolError || error instanceof InboxToolError)
        return { success: false, error: { code: error.code, message: error.message } };
      return {
        success: false,
        error: { code: "INVALID_INPUT", message: "The tool input is not valid." },
      };
    }
  };
}
