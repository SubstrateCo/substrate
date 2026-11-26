import type {
  AgentQuestion,
  AgentRequestResponse,
  ApprovalOption,
  NativeRequestPayload,
} from "@substrate/contracts/harness-runtime";

import { z } from "zod";
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
    /** codex-acp field markers (dist/index.js:41630, :41660-41661). */
    _meta: z
      .looseObject({
        codex: z
          .looseObject({
            role: acpText,
            questionId: acpText,
            isSecret: z.boolean().nullish().catch(undefined),
          })
          .nullish()
          .catch(undefined),
      })
      .nullish()
      .catch(undefined),
  })
  .catch({});
type AcpProperty = z.output<typeof acpProperty>;
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
  options: ApprovalOption[],
): NativeRequestPayload {
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
  /** The free-text field that holds the owner's own answer to this select field, if any. */
  companion: string | null;
};

// Form mode must not collect secrets: the answer is stored on the server and shown on every
// device. The same test as opencode's ACP client (packages/cli/src/acp/elicitation.ts).
const credential = /password|passphrase|secret|token|api[_ -]?key|credential|private[_ -]?key/i;

function secretField(key: string, property: AcpProperty) {
  if (property._meta?.codex?.isSecret === true) return true;
  return [key, property.title, property.description].some((text) => credential.test(text ?? ""));
}

/** Whether an input request asks for a secret, which the host declines. */
export function asksForSecret(data: AcpRequestData) {
  return Object.entries(data.requestedSchema?.properties ?? {}).some(([key, property]) =>
    secretField(key, property),
  );
}

/**
 * The select field that a free-text field gives an own answer to, or null. claude-agent-acp
 * follows each AskUserQuestion field `question_<n>` with `question_<n>_custom`
 * (dist/elicitation.js:94-95, :151). codex-acp marks its note field with role "user_note" and
 * the question's ID (dist/index.js:41660).
 */
function companionTarget(key: string, property: AcpProperty) {
  const codex = property._meta?.codex;
  if (codex?.role === "user_note") return string(codex.questionId);
  return key.endsWith("_custom") ? key.slice(0, -"_custom".length) : null;
}

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
 * The fields of a form elicitation, or null when it cannot be shown: URL mode, a secret field,
 * more than ten fields, or a required field of an unknown type. Unknown optional fields are
 * skipped. An optional free-text field that gives an own answer to a select field before it
 * joins that field, as its custom answer.
 */
function formFields(data: AcpRequestData): FormField[] | null {
  if (data.mode && data.mode !== "form") return null;
  const schema = data.requestedSchema;
  if (!schema) return null;
  const required = new Set(schema.required ?? []);
  const fields: FormField[] = [];
  for (const [key, property] of Object.entries(schema.properties ?? {})) {
    if (secretField(key, property)) return null;
    const field = {
      key,
      required: required.has(key),
      title: string(property.title),
      description: string(property.description),
      companion: null,
    };
    const type = property.type;
    if (key.length > 2000 || !key.trim()) {
      if (field.required) return null;
    } else if (type === "string") {
      const choices = formChoices(property.enum, property.oneOf);
      const target = companionTarget(key, property);
      const parent = target === null ? undefined : fields.find((entry) => entry.key === target);
      const freeText = !choices.length && !field.required;
      if (freeText && parent?.choices.length && !parent.companion) parent.companion = key;
      else fields.push({ ...field, type, choices });
    } else if (type === "number" || type === "integer" || type === "boolean")
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
): NativeRequestPayload | null {
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
    questions: fields.map((field) => {
      const question: AgentQuestion = {
        id: field.key,
        header: clip(field.title ?? field.key, 200),
        question: clip(field.description ?? field.title ?? field.key, 2000),
        options:
          field.type === "boolean"
            ? yesNo
            : field.choices.map(({ label, description }) => ({ label, description })),
        multiSelect: field.type === "array",
        allowCustom:
          field.companion !== null || (field.type !== "boolean" && field.choices.length === 0),
      };
      if (!field.required) question.optional = true;
      return question;
    }),
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
 * expiry, and answers that miss a required field decline the form. Typed text for a select field
 * with a companion goes to the companion field and counts as an answer.
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
    const answers = response.answers[field.key] ?? [];
    const offered = (answer: string) => field.choices.some((choice) => choice.label === answer);
    const value = fieldValue(field, field.companion ? answers.filter(offered) : answers);
    const typed = field.companion
      ? answers
          .filter((answer) => !offered(answer))
          .join("\n")
          .trim()
      : "";
    if (value !== undefined) content[field.key] = value;
    if (typed && field.companion) content[field.companion] = typed;
    if (value === undefined && !typed && field.required) return { action: "decline" };
  }
  return { action: "accept", content };
}
