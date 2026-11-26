import { z } from "zod";

const text = (max: number) => z.string().max(max);

const approvalOption = z.strictObject({
  id: text(100).min(1),
  label: text(100).min(1),
  style: z.enum(["approve", "deny", "neutral"]),
});
export type ApprovalOption = z.infer<typeof approvalOption>;

const agentQuestion = z.strictObject({
  id: text(2000).min(1),
  header: text(200),
  question: text(2000).min(1),
  options: z
    .array(z.strictObject({ label: text(500).min(1), description: text(2000).nullable() }))
    .max(20),
  multiSelect: z.boolean(),
  allowCustom: z.boolean(),
  /** True when the owner may skip the question. Absent means the owner must answer it. */
  optional: z.boolean().optional(),
});
export type AgentQuestion = z.infer<typeof agentQuestion>;

/** A native permission request, or a form without fields, as one choice between options. */
export const approvalRequestPayload = z.strictObject({
  type: z.literal("approval"),
  title: text(300).min(1),
  detail: text(8000).nullable(),
  options: z.array(approvalOption).min(1).max(6),
});

/** A native input request as questions. */
export const questionsRequestPayload = z.strictObject({
  type: z.literal("questions"),
  title: text(300).min(1),
  questions: z.array(agentQuestion).min(1).max(10),
});

/** One display shape for a native request of any harness. */
export type NativeRequestPayload =
  | z.infer<typeof approvalRequestPayload>
  | z.infer<typeof questionsRequestPayload>;

/** Answers to approval and question payloads. */
export const agentRequestResponse = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("approval"), optionId: text(100).min(1) }),
  z.strictObject({
    type: z.literal("questions"),
    answers: z.record(text(2000), z.array(text(4000)).max(20)),
  }),
]);
export type AgentRequestResponse = z.infer<typeof agentRequestResponse>;
