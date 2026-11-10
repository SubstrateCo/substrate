import { toFeedItem, type FeedRow } from "./feed-item";
import { expect, test } from "bun:test";

const base: FeedRow = {
  id: "n1",
  kind: "assignment",
  readAt: null,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  entityId: null,
  messageId: null,
  work: null,
  conversationId: null,
  conversation: null,
  threadId: null,
  actorName: "Alice",
  actorImage: null,
};

test("work notices take the current work title and project, and hide unreadable work", () => {
  const work = { title: "Ship", projectEntityId: "p1", projectName: "Launch" };
  expect(toFeedItem({ ...base, entityId: "t1", work })).toEqual({
    id: "n1",
    kind: "assignment",
    readAt: null,
    createdAt: base.createdAt,
    actorName: "Alice",
    actorImage: null,
    title: "Ship",
    entityId: "t1",
    projectEntityId: "p1",
    conversationId: null,
    messageId: null,
    threadId: null,
    source: { kind: "project", name: "Launch" },
    excerpt: null,
  });
  expect(toFeedItem({ ...base, entityId: "t1" })).toBeNull();
});

test("message notices are titled by kind, carry their place and excerpt, and hide without a visible conversation", () => {
  const conversation = {
    name: "launch",
    kind: "channel" as const,
    private: false,
    excerpt: "Ready?",
  };
  const message = { ...base, messageId: "m1", conversationId: "c1", conversation };
  expect(toFeedItem({ ...message, kind: "mention" })).toMatchObject({
    title: "You were mentioned",
    conversationId: "c1",
    messageId: "m1",
    entityId: null,
    source: { kind: "channel", name: "launch", private: false },
    excerpt: "Ready?",
  });
  expect(toFeedItem({ ...message, kind: "reply" })?.title).toBe("New thread reply");
  expect(toFeedItem({ ...message, conversationId: null })).toBeNull();
  expect(toFeedItem({ ...message, conversation: null })).toBeNull();
});
