import { canLeave, canRemoveMember } from "./permissions";
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
  agentId: "owned-agent",
  userId: null,
  type: "agent" as const,
  organizationId: "workspace",
};
const human = { ...ownAgent, type: "human" as const, userId: "member", agentId: null };
const task = { taskEntityId: "t" };

test("members cannot leave a DM or a task discussion", () => {
  expect(canLeave(conversation)).toBe(true);
  expect(canLeave({ ...conversation, kind: "dm" })).toBe(false);
  expect(canLeave({ ...conversation, task })).toBe(false);
  expect(canLeave({ ...conversation, joined: false })).toBe(false);
});

test("a member removes their own agent without conversation management rights", () => {
  expect(canRemoveMember(conversation, "member", ownAgent)).toBe(true);
  expect(canRemoveMember({ ...conversation, joined: false }, "member", ownAgent)).toBe(false);
  expect(canRemoveMember({ ...conversation, task }, "member", ownAgent)).toBe(false);
});

test("even managers cannot remove another person's agent or an agent from a DM", () => {
  const manager = { ...conversation, canManage: true };
  expect(canRemoveMember(manager, "owner", { ...ownAgent, agentId: null })).toBe(false);
  expect(canRemoveMember({ ...conversation, kind: "dm" }, "member", ownAgent)).toBe(false);
});

test("removing a person requires management and excludes the owner, the viewer, and partners", () => {
  const manager = { ...conversation, canManage: true };
  expect(canRemoveMember(conversation, "viewer", human)).toBe(false);
  expect(canRemoveMember(manager, "viewer", human)).toBe(true);
  expect(canRemoveMember(manager, "member", human)).toBe(false);
  expect(canRemoveMember(manager, "viewer", { ...human, userId: "owner" })).toBe(false);
  expect(canRemoveMember(manager, "viewer", { ...human, organizationId: "partner" })).toBe(false);
});
