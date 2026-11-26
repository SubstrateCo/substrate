import type { SessionRow } from "@substrate/client-storage/agent-work";
import type { LocalToolRequest } from "@substrate/contracts/harness/mcp";
import { mcpTools } from "@substrate/contracts/harness/tools";

import { InboxToolError } from "../../mail/agent/agent-error.ts";
import type { LiveTurn, RuntimeContext } from "./context.ts";

/** A lease names a session but not everyone who can wake that session may read the owner's mail. */
export async function runPrivateInbox(
  context: RuntimeContext,
  session: SessionRow,
  request: LocalToolRequest,
  liveTurn: () => LiveTurn | undefined,
) {
  const { turn } = request,
    live = liveTurn();
  const privateOrigin =
    session.kind === "dm" &&
    session.originConversationId !== null &&
    turn.origin?.conversationId === session.originConversationId &&
    turn.origin.threadId === null;
  const sameTurn =
    live?.attempt === turn.attempt &&
    session.key === turn.sessionKey &&
    turn.installationId === context.installationId;
  const interactive =
    live?.kind === "interactive" &&
    turn.kind === "interactive" &&
    !turn.destination &&
    !turn.purpose &&
    !live.handoff;
  const privateTurn = () =>
    privateOrigin &&
    sameTurn &&
    interactive &&
    live.ownerDm &&
    live === liveTurn() &&
    live.conversationId === session.originConversationId &&
    !live.invocationIds.length &&
    !turn.invocationIds?.length;
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
    const row = await context.store.turns.get(turn.turnId);
    const home = agent?.enabled && agent.home;
    const active =
      row?.status === "assigned" || row?.status === "running" || row?.status === "waiting";
    if (!home || !active || !privateTurn())
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
