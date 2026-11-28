import type { LocalToolRequest } from "@substrate/contracts/agent-tools/mcp";
import { mcpTools } from "@substrate/contracts/agent-tools/tools";

import { InboxToolError } from "../tools/inbox-error.ts";
import type { LiveTurn, RuntimeContext } from "./context.ts";

export async function runPrivateInbox(
  context: RuntimeContext,
  request: LocalToolRequest,
  liveTurn: () => LiveTurn | undefined,
) {
  const claimed = liveTurn();
  const privateTurn = () => {
    const live = liveTurn();
    if (!live || live !== claimed) return false;
    const { session } = live;
    return (
      session.kind === "dm" &&
      session.origin !== null &&
      session.origin.threadId === null &&
      session.destination === null &&
      session.id === request.sessionId &&
      live.attempt === request.turn.attempt &&
      live.kind === "interactive" &&
      !live.handoff &&
      live.ownerDm &&
      live.stopping === null &&
      !live.released &&
      live.conversationId === session.origin.conversationId
    );
  };
  async function allowed() {
    if (!privateTurn())
      throw new InboxToolError(
        "FORBIDDEN",
        "Inbox is available only in a live private DM with your owner.",
      );
    if (!(await context.enabledApps?.())?.includes("inbox"))
      throw new InboxToolError("APP_DISABLED", "Inbox is disabled.");
    context.agents.invalidate();
    const agent = await context.agents.get(request.agentId);
    if (!agent?.enabled || !agent.home || !privateTurn())
      throw new InboxToolError("FORBIDDEN", "This turn cannot access Inbox.");
  }
  await allowed();
  if (!context.inbox)
    throw new InboxToolError("UNAVAILABLE", "Inbox is unavailable on this desktop.");
  const result =
    request.tool === "search_inbox"
      ? await context.inbox.search(mcpTools.search_inbox.input.parse(request.input))
      : await context.inbox.read(mcpTools.read_inbox_message.input.parse(request.input));
  await allowed();
  return result;
}
