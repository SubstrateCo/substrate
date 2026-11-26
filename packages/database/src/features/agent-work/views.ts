import type {
  AgentRequestView,
  AgentStatusView,
  AgentVisibleRequestView,
} from "@substrate/contracts/agent-work";

import type { agentRequests } from "./requests/requests.schema";
import type { agentStatus } from "./status.schema";

const iso = (value: Date | null) => value?.toISOString() ?? null;

type Agent = { actorId: string; name: string };

/**
 * A request as its owner sees it now. `conversationName` is null when the owner cannot open the
 * request's conversation; then the request is a placeholder with no IDs, names, text or response.
 */
export function toRequestView(row: {
  request: typeof agentRequests.$inferSelect;
  agent: Agent;
  conversationName: string | null;
}): AgentRequestView {
  const { request, agent, conversationName: name } = row;
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
  };
}

/**
 * An agent's status as its owner sees it now. The live place and activity are hidden once the
 * owner cannot open the live conversation, because activity may quote it.
 */
export function toStatusView(row: {
  status: typeof agentStatus.$inferSelect;
  agent: Agent;
  liveVisible: boolean;
  device: AgentStatusView["device"];
}): AgentStatusView {
  const { status, agent, liveVisible, device } = row;
  return {
    userAgentId: status.userAgentId,
    agent,
    state: status.state,
    queuedCount: status.queuedCount,
    liveConversationId: liveVisible ? status.liveConversationId : null,
    liveThreadId: liveVisible ? status.liveThreadId : null,
    activity: status.liveConversationId === null || liveVisible ? status.activity : null,
    updatedAt: status.updatedAt.toISOString(),
    version: status.version,
    device: device?.id ? device : null,
  };
}
