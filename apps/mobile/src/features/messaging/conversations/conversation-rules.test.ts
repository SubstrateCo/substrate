import type { Conversation } from "../types";
import { sidebarSections } from "./conversation-rules";
import { describe, expect, test } from "bun:test";

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
});
