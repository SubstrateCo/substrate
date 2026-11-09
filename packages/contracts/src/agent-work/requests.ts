import type { HarnessKind } from "../harness/kinds.ts";
import { z } from "zod";

/* oxlint-disable deslop/no-unknown-parameters, deslop/no-runtime-typeof -- Native harness request payloads are untyped JSON; these functions validate them at the desktop boundary. */

const text = (max: number) => z.string().max(max);

/** permission and question are native blocking prompts or reply.ask; proposal comes from propose. */
export const agentRequestKinds = ["permission", "question", "proposal"] as const;
export type AgentRequestKind = (typeof agentRequestKinds)[number];

/** blocking: a native callback waits on the home desktop. async: the turn ended; the answer wakes the agent. */
export const agentRequestModes = ["blocking", "async"] as const;
export type AgentRequestMode = (typeof agentRequestModes)[number];

export const agentRequestStatuses = [
  "pending",
  "resolved",
  "delivered",
  "executing",
  "executed",
  "failed",
  "cancelled",
  "expired",
  "orphaned",
] as const;
export type AgentRequestStatus = (typeof agentRequestStatuses)[number];
/** The owner can still act on these. */
export const openAgentRequestStatuses: readonly AgentRequestStatus[] = ["pending"];

/** A blocking request waits this long for an answer, then the desktop denies it. */
export const blockingRequestTimeoutMs = 10 * 60_000;

export const approvalOption = z.strictObject({
  id: text(100).min(1),
  label: text(100).min(1),
  style: z.enum(["approve", "deny", "neutral"]),
});

export const agentQuestion = z.strictObject({
  id: text(2000).min(1),
  header: text(200),
  question: text(2000).min(1),
  options: z
    .array(z.strictObject({ label: text(500).min(1), description: text(2000).nullable() }))
    .max(20),
  multiSelect: z.boolean(),
  allowCustom: z.boolean(),
});

/** One display shape for every harness. The desktop keeps the native request to map the answer back. */
export const agentRequestPayload = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("approval"),
    title: text(300).min(1),
    detail: text(8000).nullable(),
    options: z.array(approvalOption).min(1).max(6),
  }),
  z.strictObject({
    type: z.literal("questions"),
    title: text(300).min(1),
    questions: z.array(agentQuestion).min(1).max(10),
  }),
  /** The exact action is stored beside the payload; see proposals.ts. */
  z.strictObject({ type: z.literal("proposal"), summary: text(2000).min(1) }),
]);
export type AgentRequestPayload = z.infer<typeof agentRequestPayload>;

/** Answers to approval and question payloads. Proposals use approve and decline instead. */
export const agentRequestResponse = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("approval"), optionId: text(100).min(1) }),
  z.strictObject({
    type: z.literal("questions"),
    answers: z.record(text(2000), z.array(text(4000)).max(20)),
  }),
]);
export type AgentRequestResponse = z.infer<typeof agentRequestResponse>;

/** reply.ask input: one async question anchored to the reply message. */
export const agentAsk = z.strictObject({
  question: z.string().trim().min(1).max(2000),
  options: z
    .array(
      z.strictObject({
        label: z.string().trim().min(1).max(500),
        description: z.string().max(2000).optional(),
      }),
    )
    .max(20)
    .default([]),
  multiSelect: z.boolean().default(false),
  allowCustom: z.boolean().default(true),
});
export type AgentAsk = z.output<typeof agentAsk>;

/** The ID of the single question in a reply.ask request. */
export const askQuestionId = "answer";

/** A reply.ask question as a request payload. A question without options always allows typing. */
export function askRequestPayload(ask: AgentAsk): AgentRequestPayload {
  return {
    type: "questions",
    title: "The agent has a question",
    questions: [
      {
        id: askQuestionId,
        header: "",
        question: ask.question,
        options: ask.options.map((option) => ({
          label: option.label,
          description: option.description ?? null,
        })),
        multiSelect: ask.multiSelect,
        allowCustom: ask.allowCustom || ask.options.length === 0,
      },
    ],
  };
}

/** A response must pick an offered option and answer only the questions that were asked. */
export function responseMatchesPayload(
  payload: AgentRequestPayload,
  response: AgentRequestResponse,
) {
  switch (payload.type) {
    case "approval":
      return (
        response.type === "approval" &&
        payload.options.some((option) => option.id === response.optionId)
      );
    case "questions": {
      if (response.type !== "questions") return false;
      const asked = new Set(payload.questions.map((question) => question.id));
      return Object.keys(response.answers).every((id) => asked.has(id));
    }
    case "proposal":
      return false;
  }
}

const jsonObject = z.record(z.string(), z.unknown());
const record = (value: unknown) => jsonObject.safeParse(value).data ?? {};
const string = (value: unknown) => (typeof value === "string" && value.trim() ? value : null);
const list = (value: unknown) => (Array.isArray(value) ? value : []);
const clip = (value: string, max: number) =>
  value.length > max ? value.slice(0, max - 1) + "…" : value;
const json = (value: unknown) =>
  clip(value === undefined ? "" : JSON.stringify(value, null, 2), 8000);

function approve(
  title: string,
  detail: string | null,
  options: z.infer<typeof approvalOption>[],
): AgentRequestPayload {
  return {
    type: "approval",
    title: clip(title, 300),
    detail: detail && clip(detail, 8000),
    options,
  };
}

const allowDeny = [
  { id: "allow", label: "Approve", style: "approve" as const },
  { id: "deny", label: "Decline", style: "deny" as const },
];
const acceptDecline = [
  { id: "accept", label: "Approve", style: "approve" as const },
  { id: "decline", label: "Decline", style: "deny" as const },
  { id: "cancel", label: "Stop the turn", style: "neutral" as const },
];

function questionOptions(value: unknown) {
  return list(value)
    .map((option) => {
      const entry = record(option);
      const label = string(entry.label);
      return label
        ? {
            label: clip(label, 500),
            description: string(entry.description)?.slice(0, 2000) ?? null,
          }
        : null;
    })
    .filter((option) => option !== null)
    .slice(0, 20);
}

function opencodeFields(form: z.infer<typeof jsonObject>) {
  return list(form.fields)
    .map((field) => record(field))
    .filter((field) => string(field.key) && field.hidden !== true && field.type !== "external");
}

/** Converts a native harness request into the shared request shape, or null when unsupported. */
export function normalizeHarnessRequest(
  harness: HarnessKind,
  kind: "permission" | "input",
  data: unknown,
): AgentRequestPayload | null {
  const value = record(data);
  switch (harness) {
    case "claude": {
      const input = record(value.input);
      const tool = string(value.toolName) ?? "a tool";
      if (kind === "permission")
        return approve(
          `Allow ${tool}?`,
          string(input.command) ?? string(input.file_path) ?? json(input),
          allowDeny,
        );
      const questions = list(input.questions)
        .map((entry) => record(entry))
        .flatMap((entry) => {
          const question = string(entry.question);
          return question
            ? [
                {
                  id: clip(question, 2000),
                  header: clip(string(entry.header) ?? "", 200),
                  question: clip(question, 2000),
                  options: questionOptions(entry.options),
                  multiSelect: entry.multiSelect === true,
                  allowCustom: true,
                },
              ]
            : [];
        });
      return questions.length
        ? {
            type: "questions",
            title: "The agent has a question",
            questions: questions.slice(0, 10),
          }
        : null;
    }
    case "codex": {
      if (kind === "permission")
        return approve(
          string(value.command) ? "Allow this command?" : "Allow these changes?",
          string(value.command) ?? string(value.reason) ?? json(value),
          acceptDecline,
        );
      const questions = list(value.questions)
        .map((entry) => record(entry))
        .flatMap((entry) => {
          const id = string(entry.id);
          const question = string(entry.question);
          return id && question
            ? [
                {
                  id: clip(id, 2000),
                  header: clip(string(entry.header) ?? "", 200),
                  question: clip(question, 2000),
                  options: questionOptions(entry.options),
                  multiSelect: false,
                  allowCustom: true,
                },
              ]
            : [];
        });
      if (questions.length)
        return {
          type: "questions",
          title: "The agent has a question",
          questions: questions.slice(0, 10),
        };
      // MCP elicitation: accept, decline, or cancel.
      return approve(string(value.message) ?? "A tool requests input", json(value), acceptDecline);
    }
    case "opencode": {
      if (kind === "permission")
        return approve(
          string(value.title) ?? `Allow ${string(value.permission) ?? "this action"}?`,
          json(value.patterns ?? value.metadata ?? value),
          [
            { id: "once", label: "Approve once", style: "approve" },
            { id: "always", label: "Always allow", style: "neutral" },
            { id: "reject", label: "Decline", style: "deny" },
          ],
        );
      const questions = opencodeFields(value).map((field) => {
        const key = string(field.key)!;
        const options =
          field.type === "boolean"
            ? [
                { label: "Yes", description: null },
                { label: "No", description: null },
              ]
            : list(field.options)
                .map((option) => record(option))
                .flatMap((option) => {
                  const label = string(option.label) ?? string(option.value);
                  return label
                    ? [{ label: clip(label, 500), description: string(option.description) }]
                    : [];
                })
                .slice(0, 20);
        return {
          id: clip(key, 2000),
          header: clip(string(field.title) ?? key, 200),
          question: clip(string(field.description) ?? string(field.title) ?? key, 2000),
          options,
          multiSelect: field.type === "multiselect",
          allowCustom: field.type !== "boolean" && (options.length === 0 || field.custom === true),
        };
      });
      return questions.length
        ? {
            type: "questions",
            title: clip(string(value.title) ?? "The agent has a question", 300),
            questions: questions.slice(0, 10),
          }
        : null;
    }
    case "antigravity": {
      const options = list(value.options)
        .map((option) => record(option))
        .flatMap((option) => {
          const id = string(option.optionId);
          if (!id) return [];
          const optionKind = string(option.kind) ?? "";
          let style: "approve" | "deny" | "neutral" = "neutral";
          if (optionKind.startsWith("allow")) style = "approve";
          else if (optionKind.startsWith("reject")) style = "deny";
          return [{ id: clip(id, 100), label: clip(string(option.name) ?? id, 100), style }];
        })
        .slice(0, 6);
      const call = record(value.toolCall);
      return options.length
        ? approve(string(call.title) ?? "Allow this action?", json(call), options)
        : null;
    }
  }
}

/** What each native adapter's respond() accepts. The adapter validates it again. */
export type NativeHarnessResponse =
  | string
  | { action: string }
  | { answers: Record<string, { answers: string[] }> }
  | Record<string, string | number | boolean | string[]>
  | undefined;

/** Converts a shared answer to the value the native adapter's respond() accepts. */
export function nativeHarnessResponse(
  harness: HarnessKind,
  kind: "permission" | "input",
  data: unknown,
  response: AgentRequestResponse,
): NativeHarnessResponse {
  if (response.type === "approval") {
    if (harness === "codex" && kind === "input") return { action: response.optionId };
    return response.optionId;
  }
  const { answers } = response;
  switch (harness) {
    case "claude":
      return Object.fromEntries(
        Object.entries(answers).map(([id, values]) => [id, values.join(", ")]),
      );
    case "codex":
      return {
        answers: Object.fromEntries(
          Object.entries(answers).map(([id, values]) => [id, { answers: values }]),
        ),
      };
    case "opencode": {
      const fields = new Map(
        opencodeFields(record(data)).map((field) => [string(field.key)!, field]),
      );
      const result: Record<string, string | number | boolean | string[]> = {};
      for (const [key, values] of Object.entries(answers)) {
        const field = fields.get(key);
        if (!field || !values.length) continue;
        if (field.type === "multiselect") result[key] = values;
        else if (field.type === "boolean") result[key] = values[0] === "Yes";
        else if (field.type === "number" || field.type === "integer")
          result[key] = Number(values[0]);
        else {
          // Selected labels map back to option values.
          const option = list(field.options)
            .map((entry) => record(entry))
            .find((entry) => entry.label === values[0]);
          result[key] = string(option?.value) ?? values[0]!;
        }
      }
      return result;
    }
    case "antigravity":
      return undefined;
  }
}

/**
 * The answer that denies a blocking request: on expiry, or when a background turn's no-ask
 * profile could not deny it natively. Null when the payload has no deny option.
 */
export function denyResponse(payload: AgentRequestPayload): AgentRequestResponse | null {
  if (payload.type !== "approval") return null;
  const option = payload.options.find((entry) => entry.style === "deny");
  return option ? { type: "approval", optionId: option.id } : null;
}
