import { unreadRepliesByThread } from "./unread-replies";
import { expect, test } from "bun:test";

test("counts each thread's unread replies", () => {
  expect(unreadRepliesByThread({ opening: [], live: ["a", "b", "a"], opened: [] })).toEqual(
    new Map([
      ["a", 2],
      ["b", 1],
    ]),
  );
});

test("keeps replies unread on opening after the timeline reads past them", () => {
  expect(unreadRepliesByThread({ opening: ["a", "a"], live: [], opened: [] })).toEqual(
    new Map([["a", 2]]),
  );
});

test("an opened thread keeps only replies that arrived after it was read", () => {
  expect(unreadRepliesByThread({ opening: ["a", "a"], live: [], opened: ["a"] })).toEqual(
    new Map<string, number>(),
  );
  expect(unreadRepliesByThread({ opening: ["a", "a"], live: ["a"], opened: ["a"] })).toEqual(
    new Map([["a", 1]]),
  );
});

test("the open thread has no unread mark", () => {
  expect(
    unreadRepliesByThread({ opening: ["a"], live: ["a", "b"], opened: [], openThreadId: "a" }),
  ).toEqual(new Map([["b", 1]]));
});
