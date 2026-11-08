import type { AgentRunView } from "@startup-os/contracts/agent-runs";

import {
  formatDuration,
  latestRunByMessage,
  questionsResponse,
  requestExpiresAt,
  setQuestionCustom,
  toggleQuestionOption,
} from "./runs";
import { describe, expect, test } from "bun:test";

function run(id: string, createdAt: string, triggerMessageIds: string[]) {
  // SAFETY: latestRunByMessage reads only these fields.
  return { id, createdAt, triggerMessageIds } as AgentRunView;
}

describe("agent run cards", () => {
  test("a message shows its latest run, and a batched run shows once under its last message", () => {
    const latest = latestRunByMessage([
      run("newest", "2026-11-08T10:05:00Z", ["a", "c"]),
      run("batched", "2026-11-08T10:01:00Z", ["a", "b"]),
      run("oldest", "2026-11-08T10:00:00Z", ["c"]),
    ]);
    expect(
      Object.fromEntries([...latest].map(([messageId, item]) => [messageId, item.id])),
    ).toEqual({ b: "batched", c: "newest" });
  });

  test.each([
    [-5000, "0s"],
    [45_900, "45s"],
    [185_000, "3m 05s"],
    [3_720_000, "1h 02m"],
  ])("formats %pms as %s", (ms, text) => {
    expect(formatDuration(ms)).toBe(text);
  });

  test("requests expire ten minutes after they open", () => {
    expect(requestExpiresAt({ createdAt: "2026-11-08T10:00:00Z" })).toBe(
      Date.parse("2026-11-08T10:10:00Z"),
    );
  });
});

describe("question answers", () => {
  const questions = [
    { id: "q1", header: "", question: "Pick", options: [], multiSelect: false, allowCustom: true },
    {
      id: "q2",
      header: "",
      question: "Pick all",
      options: [],
      multiSelect: true,
      allowCustom: true,
    },
  ];

  test("single-select replaces the choice and a typed answer replaces it", () => {
    const first = toggleQuestionOption(undefined, "A", false);
    expect(toggleQuestionOption(first, "B", false)).toEqual({ selected: ["B"], custom: "" });
    expect(setQuestionCustom(first, "Other", false)).toEqual({ selected: [], custom: "Other" });
  });

  test("multi-select toggles choices and keeps a typed answer beside them", () => {
    let draft = toggleQuestionOption(undefined, "A", true);
    draft = setQuestionCustom(draft, "Extra", true);
    draft = toggleQuestionOption(draft, "B", true);
    draft = toggleQuestionOption(draft, "A", true);
    expect(draft).toEqual({ selected: ["B"], custom: "Extra" });
  });

  test("submits every question, trimming typed answers and leaving unanswered ones empty", () => {
    expect(
      questionsResponse(questions, { q2: { selected: ["A", "B"], custom: "  More  " } }),
    ).toEqual({ type: "questions", answers: { q1: [], q2: ["A", "B", "More"] } });
  });
});
