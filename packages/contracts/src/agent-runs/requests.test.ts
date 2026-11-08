import {
  nativeHarnessResponse,
  normalizeHarnessRequest,
  responseMatchesPayload,
  type AgentRunRequestPayload,
} from "./requests.ts";
import { agentTriggers, renderAgentPrompt } from "./triggers.ts";
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
  const approval: AgentRunRequestPayload = {
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

test("prompt templates replace known variables and keep unknown ones", () => {
  const values = {
    agentName: "Research",
    authorName: "Alice",
    conversationName: "#planning",
    conversationKind: "channel",
    conversationId: "c-1",
    threadId: "t-1",
    messageId: "m-1",
    messages: "Alice: hi",
  };
  expect(renderAgentPrompt("{{ authorName }} in {{conversationName}}: {{other}}", values)).toBe(
    "Alice in #planning: {{other}}",
  );
  const rendered = renderAgentPrompt(agentTriggers.mention.defaultPrompt, values);
  expect(rendered).toContain("conversationId c-1 and threadId t-1");
  expect(rendered).not.toContain("{{");
});
