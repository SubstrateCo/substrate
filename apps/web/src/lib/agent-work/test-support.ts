import {
  sessionKeys,
  type AgentInboxItemView,
  type AgentHiddenRequestView,
  type AgentStatusView,
  type AgentTurnView,
  type AgentVisibleRequestView,
} from "@substrate/contracts/agent-work";

export const conversationId = "conversation";

export function turn(fields: Partial<AgentTurnView> = {}): AgentTurnView {
  return {
    id: "turn",
    sessionId: "session",
    userAgentId: "agent",
    sessionKind: "dm",
    kind: "interactive",
    status: "running",
    outcome: null,
    attempt: 1,
    generation: 1,
    itemIds: [],
    outputs: [],
    sourceMessages: [],
    requestAnchors: [],
    resumesTurnId: null,
    activity: null,
    error: null,
    attentionReason: null,
    usage: null,
    eventCount: 0,
    createdAt: "2026-11-08T10:00:00Z",
    startedAt: null,
    finishedAt: null,
    ...fields,
  };
}

export function source(messageId: string, createdAt: string, conversation = conversationId) {
  return { messageId, conversationId: conversation, threadId: null, createdAt };
}

export function output(id: string, createdAt: string, conversation = conversationId) {
  return { kind: "message" as const, id, conversationId: conversation, threadId: null, createdAt };
}

export function item(fields: Partial<AgentInboxItemView> = {}): AgentInboxItemView {
  return {
    id: "item",
    sessionId: "session",
    source: "owner_message",
    sourceRef: { source: "owner_message", messageId: "m1", conversationId, threadId: null },
    lane: "owner",
    status: "pending",
    held: false,
    reason: null,
    turnId: null,
    availableAt: "2026-11-08T10:00:00Z",
    createdAt: "2026-11-08T10:00:00Z",
    ...fields,
  };
}

export function request(fields: Partial<AgentVisibleRequestView> = {}): AgentVisibleRequestView {
  return {
    id: "request",
    userAgentId: "agent",
    agent: { actorId: "actor", name: "Researcher" },
    sessionKey: sessionKeys.dm(conversationId),
    turnId: "turn",
    kind: "question",
    mode: "async",
    status: "pending",
    place: {
      access: "visible",
      conversationId,
      threadId: null,
      conversationName: "Researcher",
      anchorMessageId: "reply",
    },
    payload: { type: "questions", title: "Post the update?", questions: [] },
    response: null,
    createdAt: "2026-11-08T10:00:00Z",
    resolvedAt: null,
    expiresAt: null,
    ...fields,
  };
}

/** A request in a conversation the viewer cannot open. */
export function hiddenRequest(
  fields: Partial<AgentHiddenRequestView> = {},
): AgentHiddenRequestView {
  const { sessionKey: _sessionKey, payload: _payload, response: _response, ...common } = request();
  return { ...common, place: { access: "hidden" }, ...fields };
}

export function status(fields: Partial<AgentStatusView> = {}): AgentStatusView {
  return {
    userAgentId: "agent",
    agent: { actorId: "actor", name: "Researcher" },
    state: "idle",
    queuedCount: 0,
    liveConversationId: null,
    liveThreadId: null,
    activity: null,
    updatedAt: "2026-11-08T10:00:00Z",
    version: 1,
    device: { id: "device", name: "MacBook", online: true },
    ...fields,
  };
}
