import { z } from "zod";

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
  "undelivered",
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

// ACP request fields are lenient: a field of an unexpected type is dropped, and fields this
// module does not read stay as they are, for display.
const acpText = z.string().nullish().catch(undefined);
const acpTexts = z.array(z.string()).nullish().catch(undefined);
const acpEnumOption = z
  .looseObject({ const: acpText, title: acpText, description: acpText })
  .catch({});
const acpEnumOptions = z.array(acpEnumOption).nullish().catch(undefined);
const acpProperty = z
  .looseObject({
    type: acpText,
    title: acpText,
    description: acpText,
    enum: acpTexts,
    oneOf: acpEnumOptions,
    items: z
      .looseObject({ type: acpText, enum: acpTexts, anyOf: acpEnumOptions })
      .nullish()
      .catch(undefined),
  })
  .catch({});
const acpPermissionOption = z
  .looseObject({ optionId: acpText, name: acpText, kind: acpText })
  .catch({});

/**
 * An ACP request as the adapter emitted it: `session/request_permission` params for permission
 * requests, `elicitation/create` params for input requests. Parse it once when it arrives.
 */
const acpToolCall = z
  .looseObject({
    title: acpText,
    rawInput: z.json().optional().catch(undefined),
    locations: z
      .array(z.looseObject({ path: acpText }).catch({}))
      .nullish()
      .catch(undefined),
  })
  .optional()
  .catch(undefined);
export const acpRequestData = z
  .looseObject({
    /** v1 permission subject. */
    toolCall: acpToolCall,
    /** v2 permission prompt: its own title, description, and a tool call or command subject. */
    title: acpText,
    description: acpText,
    subject: z
      .looseObject({ type: acpText, toolCall: acpToolCall, command: acpText })
      .nullish()
      .catch(undefined),
    options: z.array(acpPermissionOption).optional().catch(undefined),
    mode: acpText,
    message: acpText,
    requestedSchema: z
      .looseObject({
        title: acpText,
        properties: z.record(z.string(), acpProperty).nullish().catch(undefined),
        required: acpTexts,
      })
      .optional()
      .catch(undefined),
  })
  .catch({});
export type AcpRequestData = z.output<typeof acpRequestData>;

const string = (value: string | null | undefined) => (value?.trim() ? value : null);
const clip = (value: string, max: number) =>
  value.length > max ? value.slice(0, max - 1) + "…" : value;

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

/** A form without fields only asks the owner to accept or decline. */
const acceptDecline = [
  { id: "accept", label: "Approve", style: "approve" as const },
  { id: "decline", label: "Decline", style: "deny" as const },
  { id: "cancel", label: "Stop the turn", style: "neutral" as const },
];

/**
 * The first allow_once option approves and the first reject_once option denies, so the owner's
 * primary buttons and an expiry pick one-time decisions. Other kinds, such as allow_always, are
 * secondary choices.
 */
function permissionOptions(data: AcpRequestData) {
  const options = (data.options ?? []).flatMap((option) => {
    const id = string(option.optionId);
    if (!id || id.length > 100) return [];
    return [{ id, label: clip(string(option.name) ?? id, 100), kind: string(option.kind) ?? "" }];
  });
  const pick = (once: string, prefix: string) =>
    options.find((option) => option.kind === once) ??
    options.find((option) => option.kind.startsWith(prefix));
  const allow = pick("allow_once", "allow_");
  const reject = pick("reject_once", "reject_");
  return options.slice(0, 6).map(({ id, label }) => {
    let style: "approve" | "deny" | "neutral" = "neutral";
    if (id === allow?.id) style = "approve";
    else if (id === reject?.id) style = "deny";
    return { id, label, style };
  });
}

/** Tool input that runs a command shows the command. */
const commandInput = z.looseObject({ command: z.string().trim().min(1) });

function permissionDetail(call: NonNullable<AcpRequestData["toolCall"]>) {
  const input = call.rawInput;
  const command = commandInput.safeParse(input);
  if (command.success) return command.data.command;
  const paths = (call.locations ?? []).flatMap((location) => string(location.path) ?? []);
  if (paths.length) return paths.join("\n");
  return input === undefined ? null : JSON.stringify(input, null, 2);
}

type FormChoice = { label: string; value: string; description: string | null };
type FormField = {
  key: string;
  required: boolean;
  type: "string" | "number" | "integer" | "boolean" | "array";
  title: string | null;
  description: string | null;
  /** Enum choices. Empty for free text. */
  choices: FormChoice[];
};

function formChoices(
  values: string[] | null | undefined,
  titled: z.output<typeof acpEnumOptions>,
): FormChoice[] {
  const choices = titled?.length
    ? titled.flatMap((option) => {
        const value = string(option.const);
        return value
          ? [
              {
                label: clip(string(option.title) ?? value, 500),
                value,
                description: string(option.description)?.slice(0, 2000) ?? null,
              },
            ]
          : [];
      })
    : (values ?? []).flatMap((value) =>
        string(value) ? [{ label: clip(value, 500), value, description: null }] : [],
      );
  return choices.slice(0, 20);
}

/**
 * The fields of a form elicitation, or null when it cannot be shown: URL mode, more than ten
 * fields, or a required field of an unknown type. Unknown optional fields are skipped.
 */
function formFields(data: AcpRequestData): FormField[] | null {
  if (data.mode && data.mode !== "form") return null;
  const schema = data.requestedSchema;
  if (!schema) return null;
  const required = new Set(schema.required ?? []);
  const fields: FormField[] = [];
  for (const [key, property] of Object.entries(schema.properties ?? {})) {
    const field = {
      key,
      required: required.has(key),
      title: string(property.title),
      description: string(property.description),
    };
    const type = property.type;
    if (key.length > 2000 || !key.trim()) {
      if (field.required) return null;
    } else if (type === "string")
      fields.push({ ...field, type, choices: formChoices(property.enum, property.oneOf) });
    else if (type === "number" || type === "integer" || type === "boolean")
      fields.push({ ...field, type, choices: [] });
    else if (type === "array" && property.items) {
      const choices = formChoices(property.items.enum, property.items.anyOf);
      if (choices.length) fields.push({ ...field, type, choices });
      else if (field.required) return null;
    } else if (field.required) return null;
  }
  return fields.length > 10 ? null : fields;
}

const yesNo = [
  { label: "Yes", description: null },
  { label: "No", description: null },
];

/** Converts an ACP request into the shared request shape, or null when it cannot be shown. */
export function normalizeAcpRequest(
  kind: "permission" | "input",
  data: AcpRequestData,
): AgentRequestPayload | null {
  if (kind === "permission") {
    const options = permissionOptions(data);
    if (!options.length) return null;
    const call = data.toolCall ?? data.subject?.toolCall ?? {};
    const detail =
      string(data.subject?.command) ?? permissionDetail(call) ?? string(data.description);
    return approve(
      string(data.title) ?? string(call.title) ?? "Allow this action?",
      detail,
      options,
    );
  }
  const fields = formFields(data);
  if (!fields) return null;
  const title = string(data.message) ?? string(data.requestedSchema?.title);
  if (!fields.length) return approve(title ?? "The agent asks to continue", null, acceptDecline);
  return {
    type: "questions",
    title: clip(title ?? "The agent has a question", 300),
    questions: fields.map((field) => ({
      id: field.key,
      header: clip(field.title ?? field.key, 200),
      question: clip(field.description ?? field.title ?? field.key, 2000),
      options:
        field.type === "boolean"
          ? yesNo
          : field.choices.map(({ label, description }) => ({ label, description })),
      multiSelect: field.type === "array",
      allowCustom: field.type !== "boolean" && field.choices.length === 0,
    })),
  };
}

type ElicitationValue = string | number | boolean | string[];

/**
 * What the ACP adapter's respond() accepts: the selected permission optionId (null cancels the
 * request), or an elicitation response. The adapter validates it again.
 */
export type AcpResponse =
  | string
  | null
  | { action: "accept"; content: Record<string, ElicitationValue> }
  | { action: string };

function fieldValue(field: FormField, values: string[]): ElicitationValue | undefined {
  const chosen = (label: string) => field.choices.find((choice) => choice.label === label)?.value;
  const first = values.at(0);
  if (first === undefined) return undefined;
  switch (field.type) {
    case "array": {
      const selected = values.flatMap((label) => chosen(label) ?? []);
      return selected.length ? selected : undefined;
    }
    case "boolean":
      if (first === "Yes") return true;
      return first === "No" ? false : undefined;
    case "number":
    case "integer": {
      if (!first.trim()) return undefined;
      const number = Number(first);
      if (!Number.isFinite(number)) return undefined;
      return field.type === "integer" && !Number.isInteger(number) ? undefined : number;
    }
    case "string":
      return field.choices.length ? chosen(first) : first;
  }
}

/**
 * Converts a shared answer to the value the ACP adapter's respond() accepts. Empty answers, as on
 * expiry, and answers that miss a required field decline the form.
 */
export function acpRequestResponse(
  kind: "permission" | "input",
  data: AcpRequestData,
  response: AgentRequestResponse,
): AcpResponse {
  if (response.type === "approval")
    return kind === "permission" ? response.optionId : { action: response.optionId };
  if (kind === "permission") return null;
  const fields = formFields(data) ?? [];
  if (!Object.keys(response.answers).length) return { action: "decline" };
  const content: Record<string, ElicitationValue> = {};
  for (const field of fields) {
    const value = fieldValue(field, response.answers[field.key] ?? []);
    if (value !== undefined) content[field.key] = value;
    else if (field.required) return { action: "decline" };
  }
  return { action: "accept", content };
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
