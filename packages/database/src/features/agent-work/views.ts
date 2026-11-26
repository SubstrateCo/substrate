import type { AgentRequestView, AgentVisibleRequestView } from "@substrate/contracts/agent-work";

import type { agentRequests } from "./requests/requests.schema";

const iso = (value: Date | null) => value?.toISOString() ?? null;

type Agent = { actorId: string; name: string };

/**
 * A request as its owner sees it now. `conversationName` is null when the owner cannot open the
 * request's conversation; then the request is a placeholder with no IDs, names, text, response or
 * proposal. A proposal whose target conversation the owner cannot open is left out.
 */
export function toRequestView(row: {
  request: typeof agentRequests.$inferSelect;
  agent: Agent;
  conversationName: string | null;
  targetVisible: boolean;
}): AgentRequestView {
  const { request, agent, conversationName: name, targetVisible } = row;
  const common = {
    id: request.id,
    userAgentId: request.userAgentId,
    agent,
    turnId: request.turnId,
    kind: request.kind,
    mode: request.mode,
    status: request.status,
    createdAt: request.createdAt.toISOString(),
    resolvedAt: iso(request.resolvedAt),
    expiresAt: iso(request.expiresAt),
  };
  if (request.conversationId && name === null) return { ...common, place: { access: "hidden" } };
  let place: AgentVisibleRequestView["place"] = { access: "none" };
  if (request.conversationId && name !== null)
    place = {
      access: "visible",
      conversationId: request.conversationId,
      threadId: request.threadId,
      conversationName: name,
      anchorMessageId: request.anchorMessageId,
    };
  return {
    ...common,
    sessionKey: request.sessionKey,
    place,
    payload: request.payload,
    response: request.response,
    proposal:
      request.proposedAction && request.actionHash && targetVisible
        ? {
            action: request.proposedAction,
            actionHash: request.actionHash,
            outcome: request.outcome,
          }
        : null,
  };
}
