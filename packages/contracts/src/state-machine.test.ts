import { defineMachine } from "./state-machine.ts";
import { expect, test } from "bun:test";

const door = defineMachine({
  states: ["open", "closed", "locked", "broken"],
  terminal: ["broken"],
  events: {
    close: { from: ["open"], to: "closed" },
    lock: { from: ["closed"], to: "locked" },
    open: { from: ["closed", "locked"], to: "open" },
  },
});

test("an event moves only from the states it lists", () => {
  expect(door.next("open", "close")).toBe("closed");
  expect(door.next("locked", "open")).toBe("open");
  expect(door.next("open", "lock")).toBeNull();
  expect(door.canFire("closed", "lock")).toBe(true);
  expect(door.canFire("locked", "close")).toBe(false);
  expect(door.from("open")).toEqual(["closed", "locked"]);
});

test("a terminal state accepts no event", () => {
  for (const event of ["close", "lock", "open"] as const)
    expect(door.next("broken", event)).toBeNull();
});

test("a table that fires from a terminal or unknown state is rejected", () => {
  const states = ["a", "b"] as const;
  // SAFETY: the cast bypasses the type check on purpose, to prove the runtime check.
  const fromTerminal = { go: { from: ["b"] as never[], to: "a" as const } };
  // SAFETY: the cast bypasses the type check on purpose, to prove the runtime check.
  const unknownTarget = { go: { from: ["a"] as const, to: "c" as never } };
  expect(() => defineMachine({ states, terminal: ["b"], events: fromTerminal })).toThrow();
  expect(() => defineMachine({ states, terminal: [], events: unknownTarget })).toThrow();
});
