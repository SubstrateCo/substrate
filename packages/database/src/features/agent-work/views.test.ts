import { sessionKeys } from "@substrate/contracts/agent-work";

import type { agentRequests } from "./requests/requests.schema";
import { toRequestView } from "./views";
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
  proposedAction: { tool: "reply", input: { body: "Hi", to: { conversationId: "target" } } },
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
