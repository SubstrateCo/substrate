import type { Conversation, ConversationMember } from "../types";
import {
  canRemoveMember,
  leaveOwnerCandidates,
  managedMemberChoices,
  managedOwnerCandidates,
  ownerCandidates,
  sidebarSections,
} from "./conversation-rules";
import { describe, expect, test } from "bun:test";

const member = (userId: string, organizationId = "org"): ConversationMember => ({
  actorId: `actor-${userId}`,
  type: "human",
  userId,
  agentId: null,
  name: userId,
  image: null,
  organizationId,
  external: organizationId !== "org",
});

function conversation(overrides: Partial<Conversation>): Conversation {
  // SAFETY: tests set only the fields these rules read.
  return {
    id: "c",
    organizationId: "org",
    kind: "channel",
    name: "general",
    private: false,
    createdBy: "owner",
    joined: true,
    partner: false,
    task: null,
    canManage: true,
    members: [],
    ...overrides,
  } as Conversation;
}

describe("conversation rules", () => {
  test("the sidebar lists joined conversations by section and skips task discussions", () => {
    const sections = sidebarSections(
      [
        conversation({ id: "a" }),
        conversation({ id: "b", partner: true }),
        conversation({ id: "c", kind: "dm" }),
        conversation({ id: "d", joined: false }),
        conversation({
          id: "e",
          task: { taskEntityId: "t", projectEntityId: "p", title: "Task" },
        }),
      ],
      [{ conversationId: "c", unreadCount: 2, mentionCount: 1 }],
    );
    expect(sections.channels.map((row) => row.id)).toEqual(["a"]);
    expect(sections.partner.map((row) => row.id)).toEqual(["b"]);
    expect(sections.direct.map((row) => [row.id, row.unreadCount])).toEqual([["c", 2]]);
  });

  test("managers cannot remove the owner, themselves, or partner people", () => {
    const channel = conversation({});
    expect(canRemoveMember(channel, "me", member("alex"))).toBe(true);
    expect(canRemoveMember(channel, "me", member("owner"))).toBe(false);
    expect(canRemoveMember(channel, "me", member("me"))).toBe(false);
    expect(canRemoveMember(channel, "me", member("pat", "partner"))).toBe(false);
    expect(canRemoveMember(conversation({ kind: "dm" }), "me", member("alex"))).toBe(false);
  });

  test("an owner who leaves picks a new owner from the other people", () => {
    const channel = conversation({ createdBy: "me", members: [member("me"), member("alex")] });
    expect(leaveOwnerCandidates(channel, "me")).toEqual([{ userId: "alex", name: "alex" }]);
    expect(leaveOwnerCandidates(channel, "alex")).toEqual([]);
  });

  test("partner members cannot receive ownership of the host's channel", () => {
    const channel = conversation({
      createdBy: "me",
      members: [member("me"), member("alex"), member("pat", "partner")],
    });
    expect(leaveOwnerCandidates(channel, "me")).toEqual([{ userId: "alex", name: "alex" }]);
    expect(ownerCandidates(channel)).toEqual([{ userId: "alex", name: "alex" }]);
  });

  test("managed ownership requires both human conversation membership and live host membership", () => {
    const people = ["owner", "alex", "not-in-channel", "agent-user"].map((userId) => ({
      userId,
      name: userId,
      email: `${userId}@example.test`,
      image: null,
    }));
    const candidates = managedOwnerCandidates(
      {
        ownerUserId: "owner",
        members: [
          member("owner"),
          member("alex"),
          member("pat", "partner"),
          { ...member("agent-user"), type: "agent" },
        ],
      },
      people,
    );
    expect(candidates.map((person) => person.userId)).toEqual(["alex"]);
  });

  test("managed add-member choices exclude the acting admin even when they cannot read the conversation", () => {
    const people = ["admin", "owner", "sam"].map((userId) => ({
      userId,
      name: userId,
      email: `${userId}@example.test`,
      image: null,
    }));
    expect(managedMemberChoices(people, [member("owner")], "admin")).toEqual([
      { id: "sam", name: "sam", email: "sam@example.test", image: null },
    ]);
  });
});
