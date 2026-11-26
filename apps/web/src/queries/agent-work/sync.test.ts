import type { QueryKey } from "@tanstack/react-query";

import { queryKeys } from "../keys";
import { createBridgeChangeBatcher } from "./sync";
import { afterEach, beforeEach, expect, jest, test } from "bun:test";

const window = 50;

function setup() {
  const invalidated: QueryKey[] = [];
  const batcher = createBridgeChangeBatcher("user", "org", (queryKey) => {
    invalidated.push(queryKey);
  });
  return { invalidated, batcher };
}

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

test("hints for one turn in the same window invalidate each distinct key once", () => {
  const { invalidated, batcher } = setup();
  const change = { userAgentId: "a1", turnId: "t1" };
  batcher.receive(change);
  batcher.receive(change);
  batcher.receive(change);
  expect(invalidated).toEqual([]);
  jest.advanceTimersByTime(window);
  expect(invalidated).toEqual([
    queryKeys.agentWorkHomed("user", "org"),
    queryKeys.agentWorkTurnEvents("user", "org", "t1"),
  ]);
  batcher.dispose();
});

test("a hint without IDs in the window collapses everything to the local key", () => {
  const { invalidated, batcher } = setup();
  batcher.receive({ userAgentId: "a1", turnId: "t1" });
  batcher.receive({});
  batcher.receive({ turnId: "t2" });
  jest.advanceTimersByTime(window);
  expect(invalidated).toEqual([queryKeys.agentWorkLocal("user", "org")]);
  batcher.dispose();
});

test("a hint after the flush is invalidated in the next window", () => {
  const { invalidated, batcher } = setup();
  batcher.receive({ turnId: "t1" });
  jest.advanceTimersByTime(window);
  const first = invalidated.length;
  batcher.receive({ turnId: "t2" });
  expect(invalidated).toHaveLength(first);
  jest.advanceTimersByTime(window);
  const second = invalidated.slice(first);
  expect(second).toContainEqual(queryKeys.agentWorkTurnEvents("user", "org", "t2"));
  expect(second).not.toContainEqual(queryKeys.agentWorkTurnEvents("user", "org", "t1"));
  batcher.dispose();
});

test("dispose before the flush invalidates nothing", () => {
  const { invalidated, batcher } = setup();
  batcher.receive({ turnId: "t1" });
  batcher.dispose();
  jest.advanceTimersByTime(window * 2);
  expect(invalidated).toEqual([]);
});
