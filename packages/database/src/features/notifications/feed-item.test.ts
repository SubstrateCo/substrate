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
};

test("work notices take the current work title and project, and hide unreadable work", () => {
  const work = { title: "Ship", projectEntityId: "p1" };
  expect(toFeedItem({ ...base, entityId: "t1", work })).toEqual({
    id: "n1",
    kind: "assignment",
    readAt: null,
    createdAt: base.createdAt,
    title: "Ship",
    entityId: "t1",
    projectEntityId: "p1",
    conversationId: null,
    messageId: null,
  });
  expect(toFeedItem({ ...base, entityId: "t1" })).toBeNull();
});

test("message notices are titled by kind and hidden without a visible conversation", () => {
  const message = { ...base, messageId: "m1", conversationId: "c1" };
  expect(toFeedItem({ ...message, kind: "mention" })).toMatchObject({
    title: "You were mentioned",
    conversationId: "c1",
    messageId: "m1",
    entityId: null,
  });
  expect(toFeedItem({ ...message, kind: "reply" })?.title).toBe("New thread reply");
  expect(toFeedItem({ ...message, conversationId: null })).toBeNull();
});
