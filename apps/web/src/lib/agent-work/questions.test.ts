import { questionsResponse, setQuestionCustom, toggleQuestionOption } from "./questions";
import { requestDeadline, requestOutcome } from "./requests";
import { request } from "./test-support";
import { describe, expect, test } from "bun:test";

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

describe("request deadlines and outcomes", () => {
  test("only blocking requests have a deadline; async questions wait for the owner", () => {
    expect(requestDeadline({ mode: "async", expiresAt: "2026-11-08T10:10:00Z" })).toBeNull();
    expect(requestDeadline({ mode: "blocking", expiresAt: "2026-11-08T10:10:00Z" })).toBe(
      Date.parse("2026-11-08T10:10:00Z"),
    );
  });

  test("a decided proposal says how it ended", () => {
    const action = {
      type: "reply_elsewhere" as const,
      input: { conversationId: crypto.randomUUID(), body: "Hi" },
    };
    expect(
      requestOutcome(
        request({
          kind: "proposal",
          status: "resolved",
          proposal: { action, actionHash: "h", outcome: { status: "declined" } },
        }),
      ),
    ).toBe("Declined");
    expect(
      requestOutcome(
        request({
          kind: "proposal",
          status: "failed",
          proposal: { action, actionHash: "h", outcome: { status: "failed", error: "No access" } },
        }),
      ),
    ).toBe("Approved, but it failed: No access");
  });

  test("an answered question shows the answer", () => {
    expect(
      requestOutcome(
        request({
          status: "resolved",
          payload: {
            type: "questions",
            title: "Question",
            questions: [
              {
                id: "answer",
                header: "",
                question: "Which?",
                options: [],
                multiSelect: false,
                allowCustom: true,
              },
            ],
          },
          response: { type: "questions", answers: { answer: ["Blue"] } },
        }),
      ),
    ).toBe("Answered: Blue");
  });
});
