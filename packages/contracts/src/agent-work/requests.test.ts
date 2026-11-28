import {
  askRequestPayload,
  askQuestionId,
  agentAsk,
  denyResponse,
  responseMatchesPayload,
  type AgentRequestPayload,
} from "./requests.ts";
import { expect, test } from "bun:test";
test("a response must pick an offered option, answer only asked questions, and answer required ones", () => {
  const approval: AgentRequestPayload = {
    type: "approval",
    title: "Allow?",
    detail: null,
    options: [{ id: "allow", label: "Approve", style: "approve" }],
  };
  expect(responseMatchesPayload(approval, { type: "approval", optionId: "allow" })).toBe(true);
  expect(responseMatchesPayload(approval, { type: "approval", optionId: "other" })).toBe(false);
  expect(responseMatchesPayload(approval, { type: "questions", answers: {} })).toBe(false);
  const questions: AgentRequestPayload = {
    type: "questions",
    title: "Deploy settings",
    questions: [
      {
        id: "env",
        header: "env",
        question: "env",
        options: [],
        multiSelect: false,
        allowCustom: true,
      },
      {
        id: "count",
        header: "count",
        question: "count",
        options: [],
        multiSelect: false,
        allowCustom: true,
      },
      {
        id: "note",
        header: "note",
        question: "note",
        options: [],
        multiSelect: false,
        allowCustom: true,
        optional: true,
      },
    ],
  };
  expect(
    responseMatchesPayload(questions, {
      type: "questions",
      answers: { env: ["A"], count: ["2"], note: [] },
    }),
  ).toBe(true);
  expect(
    responseMatchesPayload(questions, {
      type: "questions",
      answers: { env: ["A"], count: ["2"], q2: ["A"] },
    }),
  ).toBe(false);
  expect(responseMatchesPayload(questions, { type: "questions", answers: { env: ["A"] } })).toBe(
    false,
  );
  expect(
    responseMatchesPayload(questions, { type: "questions", answers: { env: ["A"], count: [" "] } }),
  ).toBe(false);
});

test("proposals are never answered through respond", () => {
  const proposal: AgentRequestPayload = { type: "proposal", summary: "Post the summary" };
  expect(responseMatchesPayload(proposal, { type: "approval", optionId: "allow" })).toBe(false);
  expect(responseMatchesPayload(proposal, { type: "questions", answers: {} })).toBe(false);
});

test("reply.ask becomes one question that accepts only its own answer", () => {
  const payload = askRequestPayload(agentAsk.parse({ question: "Ship today?" }));
  expect(payload).toEqual({
    type: "questions",
    title: "The agent has a question",
    questions: [
      {
        id: askQuestionId,
        header: "",
        question: "Ship today?",
        options: [],
        multiSelect: false,
        allowCustom: true,
      },
    ],
  });
  const closed = askRequestPayload(
    agentAsk.parse({ question: "Which?", options: [], allowCustom: false }),
  );
  expect(closed.type === "questions" && closed.questions[0]!.allowCustom).toBe(true);
  const choice = askRequestPayload(
    agentAsk.parse({ question: "Which?", options: [{ label: "A" }], allowCustom: false }),
  );
  expect(choice.type === "questions" && choice.questions[0]!.allowCustom).toBe(false);
  expect(
    responseMatchesPayload(payload, { type: "questions", answers: { [askQuestionId]: ["Yes"] } }),
  ).toBe(true);
  expect(responseMatchesPayload(payload, { type: "questions", answers: { other: ["Yes"] } })).toBe(
    false,
  );
});

test("payloads without a deny option have no deny response", () => {
  const noDeny: AgentRequestPayload = {
    type: "approval",
    title: "Continue?",
    detail: null,
    options: [{ id: "ok", label: "OK", style: "neutral" }],
  };
  expect(denyResponse(noDeny)).toBeNull();
  expect(denyResponse(askRequestPayload(agentAsk.parse({ question: "Why?" })))).toBeNull();
});
