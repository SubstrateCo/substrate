import type { Message } from "../types";
import { messageRows } from "./message-grouping";
import { expect, test } from "bun:test";

const at = (day: number, hour: number, minute: number) =>
  new Date(2026, 10, day, hour, minute).toISOString();

const message = (id: string, author: string, createdAt: string, extra: Partial<Message> = {}) =>
  ({
    id,
    body: id,
    authorName: author,
    authorActorEntityId: author,
    authorType: "human",
    authorExternal: false,
    createdAt,
    threadId: null,
    replyCount: 0,
    reactions: [],
    ...extra,
  }) satisfies Message;

const layout = (messages: Message[]) =>
  messageRows(messages).map(({ message, newDay, grouped }) => [message.id, newDay, grouped]);

test("consecutive messages from one author within five minutes share a header", () => {
  expect(
    layout([
      message("a", "alice", at(8, 9, 0)),
      message("b", "alice", at(8, 9, 4)),
      message("c", "alice", at(8, 9, 10)),
      message("d", "bob", at(8, 9, 11)),
    ]),
  ).toEqual([
    ["a", true, false],
    ["b", false, true],
    ["c", false, false],
    ["d", false, false],
  ]);
});

test("a new day starts a new group and gets a divider", () => {
  expect(
    layout([message("a", "alice", at(7, 23, 58)), message("b", "alice", at(8, 0, 1))]),
  ).toEqual([
    ["a", true, false],
    ["b", true, false],
  ]);
});

test("agent messages keep their header so each reply shows its work status", () => {
  const agent = { authorType: "agent" as const };
  expect(
    layout([message("a", "bot", at(8, 9, 0), agent), message("b", "bot", at(8, 9, 1), agent)]),
  ).toEqual([
    ["a", true, false],
    ["b", false, false],
  ]);
});
