import {
  approvalRequestPayload,
  questionsRequestPayload,
  type AgentRequestResponse,
} from "../harness-runtime/requests.ts";
import { z } from "zod";

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
  "undelivered",
] as const;
export type AgentRequestStatus = (typeof agentRequestStatuses)[number];
/** The owner can still act on these. */
export const openAgentRequestStatuses: readonly AgentRequestStatus[] = ["pending"];

/** A blocking request waits this long for an answer, then the desktop denies it. */
export const blockingRequestTimeoutMs = 10 * 60_000;

/** One display shape for every harness. The desktop keeps the native request to map the answer back. */
export const agentRequestPayload = z.discriminatedUnion("type", [
  approvalRequestPayload,
  questionsRequestPayload,
  /** The exact action is stored beside the payload; see proposals.ts. */
  z.strictObject({ type: z.literal("proposal"), summary: z.string().max(2000).min(1) }),
]);
export type AgentRequestPayload = z.infer<typeof agentRequestPayload>;

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

/**
 * A response must pick an offered option, answer only the questions that were asked, and answer
 * every question that is not optional.
 */
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
      return (
        Object.keys(response.answers).every((id) => asked.has(id)) &&
        payload.questions.every(
          (question) =>
            question.optional === true ||
            (response.answers[question.id] ?? []).some((answer) => answer.trim()),
        )
      );
    }
    case "proposal":
      return false;
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
