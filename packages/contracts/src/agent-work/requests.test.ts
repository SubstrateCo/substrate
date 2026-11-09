import {
  askRequestPayload,
  askQuestionId,
  agentAsk,
  denyResponse,
  nativeHarnessResponse,
  normalizeHarnessRequest,
  responseMatchesPayload,
  type AgentRequestPayload,
} from "./requests.ts";
import { expect, test } from "bun:test";

test("Claude questions keep their text as IDs and answers join back into one string", () => {
  const data = {
    toolName: "AskUserQuestion",
    input: {
      questions: [
        {
          question: "Which branch?",
          header: "Branch",
          multiSelect: true,
          options: [{ label: "main" }, { label: "dev", description: "Daily builds" }],
        },
        { question: "  ", header: "Blank questions are skipped" },
      ],
    },
  };
  const payload = normalizeHarnessRequest("claude", "input", data);
  expect(payload).toEqual({
    type: "questions",
    title: "The agent has a question",
    questions: [
      {
        id: "Which branch?",
        header: "Branch",
        question: "Which branch?",
        options: [
          { label: "main", description: null },
          { label: "dev", description: "Daily builds" },
        ],
        multiSelect: true,
        allowCustom: true,
      },
    ],
  });
  expect(
    nativeHarnessResponse("claude", "input", data, {
      type: "questions",
      answers: { "Which branch?": ["main", "dev"] },
    }),
  ).toEqual({ "Which branch?": "main, dev" });
  expect(normalizeHarnessRequest("claude", "input", { input: { questions: [] } })).toBeNull();
});

test("each harness maps approvals to the answer its adapter accepts", () => {
  const claude = normalizeHarnessRequest("claude", "permission", {
    toolName: "Bash",
    input: { command: "ls" },
  });
  expect(claude).toMatchObject({ type: "approval", title: "Allow Bash?", detail: "ls" });
  expect(
    nativeHarnessResponse("claude", "permission", {}, { type: "approval", optionId: "allow" }),
  ).toBe("allow");
  expect(normalizeHarnessRequest("opencode", "permission", { permission: "edit" })?.type).toBe(
    "approval",
  );
  expect(
    nativeHarnessResponse("codex", "input", {}, { type: "approval", optionId: "decline" }),
  ).toEqual({ action: "decline" });
  const antigravity = normalizeHarnessRequest("antigravity", "permission", {
    options: [
      { optionId: "yes", name: "Allow", kind: "allow_once" },
      { optionId: "no", name: "Reject", kind: "reject_once" },
    ],
  });
  expect(antigravity).toMatchObject({
    options: [
      { id: "yes", style: "approve" },
      { id: "no", style: "deny" },
    ],
  });
  expect(normalizeHarnessRequest("antigravity", "permission", { options: [] })).toBeNull();
});

test("long native titles and details are clipped to the payload limits", () => {
  const payload = normalizeHarnessRequest("opencode", "permission", {
    title: "t".repeat(400),
    metadata: { text: "x".repeat(9000) },
  });
  expect(payload?.type === "approval" && payload.title.length).toBe(300);
  expect(payload?.type === "approval" && payload.detail?.length).toBe(8000);
  expect(payload?.type === "approval" && payload.title.endsWith("…")).toBe(true);
});

test("OpenCode form answers convert back to native field values", () => {
  const form = {
    title: "Deploy",
    fields: [
      { key: "env", type: "string", options: [{ value: "prod", label: "Production" }] },
      { key: "notify", type: "boolean" },
      { key: "count", type: "integer" },
      { key: "secret", type: "string", hidden: true },
    ],
  };
  const payload = normalizeHarnessRequest("opencode", "input", form);
  expect(payload?.type === "questions" && payload.questions.map((q) => q.id)).toEqual([
    "env",
    "notify",
    "count",
  ]);
  expect(
    nativeHarnessResponse("opencode", "input", form, {
      type: "questions",
      answers: { env: ["Production"], notify: ["No"], count: ["3"], secret: ["x"] },
    }),
  ).toEqual({ env: "prod", notify: false, count: 3 });
});

test("a response must pick an offered option and answer only asked questions", () => {
  const approval: AgentRequestPayload = {
    type: "approval",
    title: "Allow?",
    detail: null,
    options: [{ id: "allow", label: "Approve", style: "approve" }],
  };
  expect(responseMatchesPayload(approval, { type: "approval", optionId: "allow" })).toBe(true);
  expect(responseMatchesPayload(approval, { type: "approval", optionId: "other" })).toBe(false);
  expect(responseMatchesPayload(approval, { type: "questions", answers: {} })).toBe(false);
  const questions = normalizeHarnessRequest("codex", "input", {
    questions: [{ id: "q1", question: "Name?" }],
  })!;
  expect(responseMatchesPayload(questions, { type: "questions", answers: { q1: ["A"] } })).toBe(
    true,
  );
  expect(responseMatchesPayload(questions, { type: "questions", answers: { q2: ["A"] } })).toBe(
    false,
  );
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
  // Without options the owner must be able to type, even if the agent disallowed it.
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

test("expired approvals are denied with the payload's deny option", () => {
  const codex = normalizeHarnessRequest("codex", "permission", { command: "rm -rf build" })!;
  expect(denyResponse(codex)).toEqual({ type: "approval", optionId: "decline" });
  const noDeny: AgentRequestPayload = {
    type: "approval",
    title: "Continue?",
    detail: null,
    options: [{ id: "ok", label: "OK", style: "neutral" }],
  };
  expect(denyResponse(noDeny)).toBeNull();
  expect(denyResponse(askRequestPayload(agentAsk.parse({ question: "Why?" })))).toBeNull();
});
