import type { TurnEventView } from "@substrate/contracts/agent-work";

import { transcriptEntries } from "./transcript";
import { usageLabel } from "./usage";
import { describe, expect, test } from "bun:test";

let seq = 0;
function event<K extends TurnEventView["kind"]>(
  kind: K,
  data: Extract<TurnEventView, { kind: K }>["data"],
  fields: { itemId?: string; attempt?: number } = {},
) {
  // SAFETY: kind and data come from the same K, which is one member of the TurnEventView union.
  return {
    turnId: "turn",
    seq: ++seq,
    attempt: fields.attempt ?? 1,
    kind,
    itemId: fields.itemId ?? null,
    data,
    createdAt: "2026-11-08T10:00:00Z",
  } as TurnEventView;
}

const entryKinds = (entries: ReturnType<typeof transcriptEntries>) =>
  entries.map((entry) =>
    entry.type === "step" ? [entry.type, entry.text, entry.state] : [entry.type],
  );

describe("transcript entries", () => {
  test("a tool's start and completion are one step; an open tool is current while working", () => {
    const events = [
      event("turn_started", {}),
      event("text", { text: "Let me look." }),
      event("tool_started", { itemType: "read", title: "Read README.md" }, { itemId: "t1" }),
      event("tool_completed", { status: "completed" }, { itemId: "t1" }),
      event("tool_started", { itemType: "shell", title: "Run tests" }, { itemId: "t2" }),
    ];
    expect(entryKinds(transcriptEntries(events, true))).toEqual([
      ["text"],
      ["step", "Read README.md", "done"],
      ["step", "Run tests", "current"],
    ]);
  });

  test("a failed tool is an error, and an unfinished tool in a stopped turn is too", () => {
    const events = [
      event("tool_started", { itemType: "shell", title: "Deploy" }, { itemId: "t1" }),
      event("tool_completed", { status: "failed" }, { itemId: "t1" }),
      event("tool_started", { itemType: "shell", title: "Retry" }, { itemId: "t2" }),
    ];
    expect(entryKinds(transcriptEntries(events, false))).toEqual([
      ["step", "Deploy", "error"],
      ["step", "Retry", "error"],
    ]);
  });

  test("a new attempt starts a section and closes the tools the last attempt left open", () => {
    const events = [
      event("tool_started", { itemType: "shell", title: "Build" }, { itemId: "t1" }),
      event("text", { text: "Resuming." }, { attempt: 2 }),
    ];
    expect(entryKinds(transcriptEntries(events, true))).toEqual([
      ["step", "Build", "error"],
      ["attempt"],
      ["text"],
    ]);
  });

  test("requests, outputs, steered input and errors keep their place", () => {
    const events = [
      event("request", { requestId: "r1", kind: "question" }),
      event("input_consumed", { inputId: "i1" }),
      event("output", { kind: "task", id: "task", createdAt: "2026-11-08T10:00:00Z" }),
      event("error", { code: "x", message: "Timed out" }),
    ];
    expect(entryKinds(transcriptEntries(events, false))).toEqual([
      ["request"],
      ["input"],
      ["output"],
      ["error"],
    ]);
  });
});

describe("usage", () => {
  test("missing usage is unavailable, never zero", () => {
    expect(usageLabel(null)).toBe("Unavailable");
    expect(usageLabel({})).toBe("Unavailable");
  });

  test("reported counts and context share show as reported", () => {
    expect(
      usageLabel({ inputTokens: 12_345, outputTokens: 980, contextUsed: 45, contextWindow: 100 }),
    ).toBe("12k in · 980 out · 45% of context");
  });
});
