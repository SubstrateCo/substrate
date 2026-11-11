import { sessionKeys } from "@substrate/contracts/agent-work";

import type { agentRequests } from "./requests.schema";
import type { agentStatus } from "./status.schema";
import { toRequestView, toStatusView } from "./views";
import { expect, test } from "bun:test";

const agent = { actorId: "actor", name: "Research" };
const created = new Date("2026-01-01T00:00:00Z");
const request: typeof agentRequests.$inferSelect = {
  id: "request",
  organizationId: "org",
  userAgentId: "agent",
  ownerUserId: "owner",
  agentActorEntityId: "actor",
  sessionKey: sessionKeys.thread("root"),
  turnId: "turn",
  epoch: null,
  kind: "proposal",
  mode: "async",
  nativeRequestId: null,
  anchorMessageId: "anchor",
  conversationId: "conversation",
  threadId: "root",
  payload: { type: "approval", title: "Post", detail: null, options: [] },
  proposedAction: { type: "reply_elsewhere", input: { conversationId: "target", body: "Hi" } },
  actionHash: "hash",
  targetBasis: null,
  response: null,
  outcome: null,
  status: "pending",
  resolvedByUserId: null,
  createdAt: created,
  resolvedAt: null,
  deliveredAt: null,
  expiresAt: null,
};

test("a request in a visible place shows its place, payload and proposal", () => {
  expect(
    toRequestView({ request, agent, conversationName: "General", targetVisible: true }),
  ).toMatchObject({
    sessionKey: sessionKeys.thread("root"),
    place: {
      access: "visible",
      conversationId: "conversation",
      threadId: "root",
      conversationName: "General",
      anchorMessageId: "anchor",
    },
    payload: request.payload,
    proposal: { action: request.proposedAction, actionHash: "hash", outcome: null },
    createdAt: created.toISOString(),
  });
});

test("a request in a hidden place is a placeholder without IDs, text or proposal", () => {
  const view = toRequestView({ request, agent, conversationName: null, targetVisible: true });
  expect(view.place).toEqual({ access: "hidden" });
  for (const field of ["sessionKey", "payload", "response", "proposal"])
    expect(view).not.toHaveProperty(field);
  expect(JSON.stringify(view)).not.toContain('conversation"');
});

test("a proposal whose target the owner cannot open is left out, and placeless requests say none", () => {
  const placeless = { ...request, conversationId: null, threadId: null, anchorMessageId: null };
  const view = toRequestView({
    request: placeless,
    agent,
    conversationName: null,
    targetVisible: false,
  });
  expect(view.place).toEqual({ access: "none" });
  expect(view.proposal).toBeNull();
  expect(view.payload).toEqual(request.payload);
});

const status: typeof agentStatus.$inferSelect = {
  userAgentId: "agent",
  organizationId: "org",
  ownerUserId: "owner",
  state: "working",
  queuedCount: 2,
  liveConversationId: "conversation",
  liveThreadId: "root",
  activity: "Reading the thread",
  updatedAt: created,
  version: 7,
};

test("status hides the live place and its activity once the owner cannot open it", () => {
  const device = { id: "device", name: "Laptop", online: true };
  expect(toStatusView({ status, agent, liveVisible: true, device })).toMatchObject({
    liveConversationId: "conversation",
    liveThreadId: "root",
    activity: "Reading the thread",
    device,
  });
  expect(toStatusView({ status, agent, liveVisible: false, device })).toMatchObject({
    liveConversationId: null,
    liveThreadId: null,
    activity: null,
  });
  const placeless = { ...status, liveConversationId: null, liveThreadId: null };
  expect(
    toStatusView({ status: placeless, agent, liveVisible: false, device: null }),
  ).toMatchObject({ activity: "Reading the thread", device: null });
});
