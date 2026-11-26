import {
  sessionKeys,
  type AgentAttentionTurnView,
  type AgentHiddenRequestView,
  type AgentStatusView,
  type AgentUncertainItemView,
  type AgentVisibleRequestView,
  type AgentWorkItemView,
  type AgentWorkTurnView,
} from "@substrate/contracts/agent-work";

export const conversationId = "conversation";

export function turn(fields: Partial<AgentWorkTurnView> = {}): AgentWorkTurnView {
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
    handoff: false,
    itemIds: [],
    outputs: [],
    sourceMessages: [],
    requestAnchors: [],
    resumesTurnId: null,
    activity: null,
    error: null,
    attentionReason: null,
    interruption: null,
    usage: null,
    placeVisible: true,
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

export function item(fields: Partial<AgentWorkItemView> = {}): AgentWorkItemView {
  return {
    id: "item",
    sessionId: "session",
    turnId: null,
    source: "owner_message",
    sourceRef: { source: "owner_message", messageId: "m1", conversationId, threadId: null },
    lane: "owner",
    status: "pending",
    held: false,
    steered: false,
    reason: null,
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
    payload: { type: "proposal", summary: "Post the update" },
    response: null,
    proposal: null,
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
  const {
    sessionKey: _sessionKey,
    payload: _payload,
    response: _response,
    proposal: _proposal,
    ...common
  } = request();
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
    device: { id: "device", name: "MacBook", online: true },
    ...fields,
  };
}

/** A stopped turn in the Needs you list. */
export function attentionTurn(
  fields: Partial<AgentAttentionTurnView> = {},
): AgentAttentionTurnView {
  return {
    id: "turn",
    userAgentId: "agent",
    agent: { actorId: "actor", name: "Researcher" },
    sessionId: "session",
    attentionReason: "uncertain_input",
    place: { conversationId, threadId: null },
    createdAt: "2026-11-08T10:00:00Z",
    finishedAt: "2026-11-08T10:01:00Z",
    ...fields,
  };
}

/** An item the home desktop couldn't confirm the agent received, in the Needs you list. */
export function uncertainItem(
  fields: Partial<AgentUncertainItemView> = {},
): AgentUncertainItemView {
  return {
    id: "item",
    userAgentId: "agent",
    agent: { actorId: "actor", name: "Researcher" },
    turnId: "turn",
    source: "owner_message",
    place: { conversationId, threadId: null },
    createdAt: "2026-11-08T10:00:00Z",
    ...fields,
  };
}
