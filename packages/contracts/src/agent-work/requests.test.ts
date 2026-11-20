import {
  acpRequestData,
  acpRequestResponse,
  askRequestPayload,
  askQuestionId,
  agentAsk,
  denyResponse,
  normalizeAcpRequest,
  responseMatchesPayload,
  type AgentRequestPayload,
} from "./requests.ts";
import { expect, test } from "bun:test";

const permission = (options: { optionId: string; name: string; kind: string }[]) =>
  acpRequestData.parse({
    sessionId: "s1",
    toolCall: { toolCallId: "t1", title: "Run ls", rawInput: { command: "ls -la" } },
    options,
  });

const fullOptions = [
  { optionId: "always", name: "Always allow", kind: "allow_always" },
  { optionId: "once", name: "Allow", kind: "allow_once" },
  { optionId: "never", name: "Always reject", kind: "reject_always" },
  { optionId: "no", name: "Reject", kind: "reject_once" },
];

test("permission options keep their ACP IDs, and one-time choices are the primary buttons", () => {
  const data = permission(fullOptions);
  expect(normalizeAcpRequest("permission", data)).toEqual({
    type: "approval",
    title: "Run ls",
    detail: "ls -la",
    options: [
      { id: "always", label: "Always allow", style: "neutral" },
      { id: "once", label: "Allow", style: "approve" },
      { id: "never", label: "Always reject", style: "neutral" },
      { id: "no", label: "Reject", style: "deny" },
    ],
  });
  expect(acpRequestResponse("permission", data, { type: "approval", optionId: "always" })).toBe(
    "always",
  );
});

test("an expired permission picks reject_once, and cancels when no option rejects", () => {
  const data = permission(fullOptions);
  const payload = normalizeAcpRequest("permission", data)!;
  const expired = denyResponse(payload)!;
  expect(acpRequestResponse("permission", data, expired)).toBe("no");

  const allowOnly = permission([{ optionId: "ok", name: "Allow", kind: "allow_once" }]);
  expect(denyResponse(normalizeAcpRequest("permission", allowOnly)!)).toBeNull();
  expect(
    acpRequestResponse("permission", allowOnly, { type: "questions", answers: {} }),
  ).toBeNull();
});

test("without allow_once or reject_once, the first allow and reject options are primary", () => {
  const payload = normalizeAcpRequest(
    "permission",
    permission([
      { optionId: "a", name: "Always allow", kind: "allow_always" },
      { optionId: "r", name: "Always reject", kind: "reject_always" },
    ]),
  );
  expect(payload?.type === "approval" && payload.options.map((option) => option.style)).toEqual([
    "approve",
    "deny",
  ]);
});

test("a permission without usable options cannot be shown", () => {
  expect(normalizeAcpRequest("permission", permission([]))).toBeNull();
  expect(
    normalizeAcpRequest("permission", acpRequestData.parse({ toolCall: { title: "Edit" } })),
  ).toBeNull();
});

test("permission details fall back to file locations, then the raw input", () => {
  const located = acpRequestData.parse({
    toolCall: { title: "Edit", locations: [{ path: "src/a.ts" }, { path: "src/b.ts" }] },
    options: fullOptions,
  });
  expect(normalizeAcpRequest("permission", located)).toMatchObject({
    detail: "src/a.ts\nsrc/b.ts",
  });
  const raw = acpRequestData.parse({
    toolCall: { rawInput: { url: "https://example.com" } },
    options: fullOptions,
  });
  expect(normalizeAcpRequest("permission", raw)).toMatchObject({
    title: "Allow this action?",
    detail: JSON.stringify({ url: "https://example.com" }, null, 2),
  });
});

test("ACP v2 permissions use the prompt title and show the command or tool call subject", () => {
  const command = acpRequestData.parse({
    sessionId: "s1",
    title: "Run a command",
    description: "Lists files",
    subject: { type: "command", command: "ls -la", cwd: "/work" },
    options: fullOptions,
  });
  expect(normalizeAcpRequest("permission", command)).toMatchObject({
    title: "Run a command",
    detail: "ls -la",
  });
  const toolCall = acpRequestData.parse({
    sessionId: "s1",
    title: "Edit files",
    subject: {
      type: "tool_call",
      toolCall: { toolCallId: "t1", locations: [{ path: "/work/a.ts" }] },
    },
    options: fullOptions,
  });
  expect(normalizeAcpRequest("permission", toolCall)).toMatchObject({
    title: "Edit files",
    detail: "/work/a.ts",
  });
  const described = acpRequestData.parse({
    title: "Use the network",
    description: "Fetches the release notes",
    options: fullOptions,
  });
  expect(normalizeAcpRequest("permission", described)).toMatchObject({
    detail: "Fetches the release notes",
  });
});

test("long titles and details are clipped to the payload limits", () => {
  const payload = normalizeAcpRequest(
    "permission",
    acpRequestData.parse({
      toolCall: { title: "t".repeat(400), rawInput: { command: "x".repeat(9000) } },
      options: fullOptions,
    }),
  );
  expect(payload?.type === "approval" && payload.title.length).toBe(300);
  expect(payload?.type === "approval" && payload.detail?.length).toBe(8000);
  expect(payload?.type === "approval" && payload.title.endsWith("…")).toBe(true);
});

const form = acpRequestData.parse({
  sessionId: "s1",
  mode: "form",
  message: "Deploy settings",
  requestedSchema: {
    type: "object",
    properties: {
      env: {
        type: "string",
        title: "Environment",
        oneOf: [
          { const: "prod", title: "Production" },
          { const: "dev", title: "Development", description: "Daily builds" },
        ],
      },
      region: { type: "string", enum: ["eu", "us"] },
      note: { type: "string", description: "Anything else?" },
      notify: { type: "boolean" },
      count: { type: "integer" },
      targets: { type: "array", items: { anyOf: [{ const: "web", title: "Web" }] } },
      future: { type: "_custom" },
    },
    required: ["env", "count"],
  },
});

test("form fields become questions, and unknown optional fields are skipped", () => {
  const payload = normalizeAcpRequest("input", form);
  expect(payload).toEqual({
    type: "questions",
    title: "Deploy settings",
    questions: [
      {
        id: "env",
        header: "Environment",
        question: "Environment",
        options: [
          { label: "Production", description: null },
          { label: "Development", description: "Daily builds" },
        ],
        multiSelect: false,
        allowCustom: false,
      },
      {
        id: "region",
        header: "region",
        question: "region",
        options: [
          { label: "eu", description: null },
          { label: "us", description: null },
        ],
        multiSelect: false,
        allowCustom: false,
      },
      {
        id: "note",
        header: "note",
        question: "Anything else?",
        options: [],
        multiSelect: false,
        allowCustom: true,
      },
      {
        id: "notify",
        header: "notify",
        question: "notify",
        options: [
          { label: "Yes", description: null },
          { label: "No", description: null },
        ],
        multiSelect: false,
        allowCustom: false,
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
        id: "targets",
        header: "targets",
        question: "targets",
        options: [{ label: "Web", description: null }],
        multiSelect: true,
        allowCustom: false,
      },
    ],
  });
});

test("form answers convert to typed elicitation content", () => {
  expect(
    acpRequestResponse("input", form, {
      type: "questions",
      answers: {
        env: ["Development"],
        region: ["us"],
        note: ["Ship it"],
        notify: ["No"],
        count: ["3"],
        targets: ["Web"],
        unknown: ["x"],
      },
    }),
  ).toEqual({
    action: "accept",
    content: {
      env: "dev",
      region: "us",
      note: "Ship it",
      notify: false,
      count: 3,
      targets: ["web"],
    },
  });
});

test("a form declines when answers are empty or miss a required field", () => {
  expect(acpRequestResponse("input", form, { type: "questions", answers: {} })).toEqual({
    action: "decline",
  });
  expect(
    acpRequestResponse("input", form, {
      type: "questions",
      answers: { env: ["Production"], count: ["2.5"] },
    }),
  ).toEqual({ action: "decline" });
});

test("a form without fields asks to accept, decline, or cancel", () => {
  const data = acpRequestData.parse({
    mode: "form",
    message: "Continue with the login?",
    requestedSchema: { type: "object", properties: {} },
  });
  const payload = normalizeAcpRequest("input", data);
  expect(payload).toMatchObject({ type: "approval", title: "Continue with the login?" });
  expect(denyResponse(payload!)).toEqual({ type: "approval", optionId: "decline" });
  expect(acpRequestResponse("input", data, { type: "approval", optionId: "cancel" })).toEqual({
    action: "cancel",
  });
});

test("URL elicitations and forms with an unknown required field cannot be shown", () => {
  expect(
    normalizeAcpRequest(
      "input",
      acpRequestData.parse({ mode: "url", message: "Sign in", url: "https://example.com" }),
    ),
  ).toBeNull();
  expect(
    normalizeAcpRequest(
      "input",
      acpRequestData.parse({
        mode: "form",
        message: "Pick",
        requestedSchema: { properties: { file: { type: "_file" } }, required: ["file"] },
      }),
    ),
  ).toBeNull();
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
  const questions = normalizeAcpRequest("input", form)!;
  expect(responseMatchesPayload(questions, { type: "questions", answers: { env: ["A"] } })).toBe(
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
