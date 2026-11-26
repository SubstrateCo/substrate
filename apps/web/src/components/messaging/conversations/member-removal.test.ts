import { canRemoveMember } from "./member-removal";
import { expect, test } from "bun:test";

const conversation = {
  kind: "channel" as const,
  joined: true,
  canManage: false,
  organizationId: "workspace",
  createdBy: "owner",
  task: null,
};
const ownAgent = {
  actorId: "agent-actor",
  agentId: "owned-agent",
  userId: null,
  type: "agent" as const,
  organizationId: "workspace",
  name: "Assistant",
};

test("a member removes their own agent without conversation management rights", () => {
  expect(canRemoveMember(conversation, "member", ownAgent)).toBe(true);
  expect(canRemoveMember({ ...conversation, joined: false }, "member", ownAgent)).toBe(false);
});

test("even managers cannot remove another person's agent or an agent from a DM", () => {
  expect(
    canRemoveMember({ ...conversation, canManage: true }, "owner", {
      ...ownAgent,
      agentId: undefined,
    }),
  ).toBe(false);
  expect(canRemoveMember({ ...conversation, kind: "dm" }, "member", ownAgent)).toBe(false);
});

test("human removal still requires management and excludes the owner and viewer", () => {
  const human = { ...ownAgent, type: "human" as const, userId: "member", agentId: undefined };
  expect(canRemoveMember(conversation, "viewer", human)).toBe(false);
  expect(canRemoveMember({ ...conversation, canManage: true }, "viewer", human)).toBe(true);
  expect(canRemoveMember({ ...conversation, canManage: true }, "member", human)).toBe(false);
  expect(
    canRemoveMember({ ...conversation, canManage: true }, "viewer", {
      ...human,
      userId: "owner",
    }),
  ).toBe(false);
});
