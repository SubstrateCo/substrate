import type { AgentRunView } from "@startup-os/contracts/agent-runs";

import {
  formatDuration,
  questionsResponse,
  requestExpiresAt,
  runPlacements,
  runStatus,
  runSteps,
  setQuestionCustom,
  toggleQuestionOption,
} from "./runs";
import { describe, expect, test } from "bun:test";

function run(
  id: string,
  createdAt: string,
  triggerMessageIds: string[],
  replyMessageIds: string[] = [],
) {
  // SAFETY: runPlacements reads only these fields.
  return { id, createdAt, triggerMessageIds, replyMessageIds } as AgentRunView;
}

function timed(fields: Partial<AgentRunView>): AgentRunView {
  return {
    id: "run",
    agent: { actorId: "actor", agentId: "agent", name: "Researcher" },
    conversationId: "conversation",
    threadId: "thread",
    status: "queued",
    triggerKind: "mention",
    triggerMessageIds: [],
    replyMessageIds: [],
    activity: null,
    error: null,
    device: null,
    createdAt: "2026-11-08T10:00:00Z",
    startedAt: null,
    finishedAt: null,
    expiresAt: "2026-11-09T10:00:00Z",
    requests: [],
    ...fields,
  };
}

describe("agent run placement", () => {
  test("a run without a reply shows once, as the latest pending reply under its last trigger", () => {
    const placements = runPlacements([
      run("newest", "2026-11-08T10:05:00Z", ["a", "c"]),
      run("batched", "2026-11-08T10:01:00Z", ["a", "b"]),
      run("oldest", "2026-11-08T10:00:00Z", ["c"]),
    ]);
    expect(
      Object.fromEntries([...placements].map(([id, item]) => [id, [item.run.id, item.kind]])),
    ).toEqual({ b: ["batched", "pending"], c: ["newest", "pending"] });
  });

  test("a run that replied moves under its latest reply and leaves its trigger", () => {
    const placements = runPlacements([run("replied", "2026-11-08T10:00:00Z", ["a"], ["r1", "r2"])]);
    expect([...placements].map(([id, item]) => [id, item.kind])).toEqual([["r2", "reply"]]);
  });
});

describe("agent run status", () => {
  const now = Date.parse("2026-11-08T10:01:12Z");

  test("an open request needs attention before any other state", () => {
    const status = runStatus(
      timed({
        status: "running",
        requests: [
          {
            id: "request",
            runId: "run",
            status: "pending",
            payload: { type: "approval", title: "Allow write?", detail: null, options: [] },
            response: null,
            createdAt: "2026-11-08T10:01:00Z",
            resolvedAt: null,
          },
        ],
      }),
      now,
    );
    expect(status).toEqual({ tone: "attention", label: "Needs your approval" });
  });

  test("time counts from the start while working and stops when the run ends", () => {
    const started = { startedAt: "2026-11-08T10:00:00Z" };
    expect(runStatus(timed({ status: "running", ...started }), now)).toEqual({
      tone: "working",
      label: "Working for 1m 12s",
    });
    expect(
      runStatus(
        timed({ status: "completed", ...started, finishedAt: "2026-11-08T10:02:40Z" }),
        now,
      ),
    ).toEqual({ tone: "done", label: "Worked for 2m 40s" });
  });

  test("a queued run says which desktop it waits for", () => {
    const device = { id: "d", name: "MacBook", online: false };
    expect(runStatus(timed({ status: "queued", device }), now).label).toBe(
      "Queued · MacBook is offline",
    );
  });
});

describe("agent run steps", () => {
  const events = [
    { sequence: 1, kind: "activity" as const, text: "Working" },
    { sequence: 2, kind: "text" as const, text: "Let me look." },
    { sequence: 3, kind: "activity" as const, text: "Read README.md" },
    { sequence: 4, kind: "activity" as const, text: "Ran tests" },
  ];

  test("steps leave out text and the start marker, and the last one is current while working", () => {
    expect(runSteps(events, true).map((step) => [step.text, step.state])).toEqual([
      ["Read README.md", "done"],
      ["Ran tests", "current"],
    ]);
    expect(runSteps(events, false).at(-1)!.state).toBe("done");
  });

  test("errors are steps that stay errors", () => {
    const failed = [...events, { sequence: 5, kind: "error" as const, text: "Timed out" }];
    expect(runSteps(failed, true).at(-1)).toEqual({ key: "5", text: "Timed out", state: "error" });
  });
});

describe("agent run times", () => {
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
