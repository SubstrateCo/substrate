import {
  triggerRegistry,
  type AgentSourceMessage,
  type AgentWakeRequestDetail,
  type EnvelopeItem,
  type EnvelopeResumeNote,
  type EnvelopeTurn,
  type ProposalOutcome,
  type TriggerDefinition,
} from "@substrate/contracts/agent-work";
import type { HostItem } from "@substrate/contracts/agent-work/control";

/** Escapes text so that no body or attribute can open or close an envelope tag. */
function fence(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
function attribute(value: string) {
  return fence(value).replaceAll('"', "&quot;");
}
function attributes(values: [string, string | number | null][]) {
  return values
    .flatMap(([name, value]) => (value === null ? [] : [` ${name}="${attribute(String(value))}"`]))
    .join("");
}

function resume(note: EnvelopeResumeNote) {
  const lines = [
    "An earlier attempt of this turn stopped before it finished. Check what already happened before you repeat any write.",
    ...note.completedTools.map((tool) => `Finished: ${tool}`),
    ...note.outputs.map((output) => `Published: ${output}`),
  ];
  return `<resume${attributes([
    ["turn", note.turnId],
    ["previous_attempt", note.previousAttempt],
  ])}>${fence(lines.join("\n"))}</resume>`;
}

/**
 * Renders the turn input. The same input always gives the same bytes: items keep the order the
 * caller sorted them in, attributes have a fixed order, and every body is escaped.
 */
export function renderEnvelope(turn: EnvelopeTurn) {
  const parts = [
    `<turn${attributes([
      ["time", turn.time],
      ["session", turn.session],
      ["kind", turn.kind],
      ["attempt", turn.attempt],
    ])}>`,
  ];
  if (turn.changes.length) parts.push(`<changes>${fence(turn.changes.join("\n"))}</changes>`);
  if (turn.resume) parts.push(resume(turn.resume));
  for (const item of turn.items)
    parts.push(
      `<item${attributes([
        ["id", item.id],
        ["source", item.source],
        ["author", item.author],
        ["author_kind", item.authorKind],
        ["conversation", item.conversationId],
        ["thread", item.threadId],
        ["message", item.messageId],
      ])}>${fence(item.body)}</item>`,
    );
  parts.push("</turn>");
  return parts.join("\n");
}

function outcomeLine(outcome: ProposalOutcome | null) {
  if (!outcome) return "Outcome: not known yet.";
  switch (outcome.status) {
    case "declined":
      return "Outcome: declined. Nothing ran.";
    case "failed":
      return `Outcome: approved, but it failed: ${outcome.error}`;
    case "executed": {
      const { receipt } = outcome;
      if (receipt.kind === "task")
        return `Outcome: approved and done. Task ${receipt.id} in project ${receipt.projectId}.`;
      if (receipt.kind === "project") return `Outcome: approved and done. Project ${receipt.id}.`;
      if (receipt.kind === "crm")
        return `Outcome: approved and done. CRM ${receipt.entityType} ${receipt.id}.`;
      if (receipt.kind === "deleted")
        return `Outcome: approved and done. Deleted ${receipt.entityType} ${receipt.id}.`;
      if (receipt.kind === "done") return `Outcome: approved and done. ${receipt.tool} ran.`;
      const thread = receipt.threadId ? ` thread ${receipt.threadId}` : "";
      return `Outcome: approved and done. Posted message ${receipt.id} in conversation ${receipt.conversationId}${thread}.`;
    }
  }
}

/** What the owner decided on a request, in a fixed order so the same detail gives the same text. */
function decisionLines(source: "answer" | "approval_result", request: AgentWakeRequestDetail) {
  const { payload } = request;
  if (source === "approval_result")
    return [
      `Your owner decided on your proposal (request ${request.id}).`,
      `Proposal: ${payload.type === "proposal" ? payload.summary : payload.title}`,
      outcomeLine(request.outcome),
    ];
  const lines = [`Your owner answered your question (request ${request.id}).`];
  const response = request.response;
  if (payload.type === "questions")
    for (const entry of payload.questions) {
      lines.push(`Question: ${entry.question}`);
      if (entry.options.length)
        lines.push(`Options: ${entry.options.map((option) => option.label).join(" | ")}`);
      const answer = response?.type === "questions" ? response.answers[entry.id] : undefined;
      lines.push(`Answer: ${answer?.length ? answer.join(" | ") : "(no answer)"}`);
    }
  else if (payload.type === "approval" && response?.type === "approval") {
    const chosen = payload.options.find((option) => option.id === response.optionId);
    lines.push(`Question: ${payload.title}`, `Answer: ${chosen?.label ?? response.optionId}`);
  }
  return lines;
}

/** Work items in a stable order: oldest first, then by ID. */
export function sortItems<T extends Pick<HostItem, "createdAt" | "id">>(items: T[]) {
  const byId = (a: string, b: string) => {
    if (a === b) return 0;
    return a < b ? -1 : 1;
  };
  return [...items].sort(
    (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || byId(a.id, b.id),
  );
}

/**
 * The envelope item for an inbox item, or null when its source message is not visible to the
 * owner any more. Message bodies come only from device/sources.
 */
export function envelopeItem(
  item: HostItem,
  context: { sessionKind: string; messages: Map<string, AgentSourceMessage> },
): EnvelopeItem | null {
  return renderers[triggerRegistry[item.sourceRef.source].envelope](item, context);
}

/** Context batches share one delivery receipt, while preserving each message's attribution. */
export function envelopeItems(
  item: HostItem,
  context: { sessionKind: string; messages: Map<string, AgentSourceMessage> },
): EnvelopeItem[] {
  if (item.sourceRef.source !== "thread_context") {
    const rendered = envelopeItem(item, context);
    return rendered ? [rendered] : [];
  }
  return item.sourceRef.messageIds.flatMap((id) => {
    const message = context.messages.get(id);
    return message
      ? [
          {
            id,
            source: item.source,
            author: message.author.name,
            authorKind: message.author.kind,
            conversationId: message.conversationId,
            threadId: message.threadId,
            messageId: id,
            body: message.body,
          },
        ]
      : [];
  });
}

type ItemRenderer = (
  item: HostItem,
  context: { sessionKind: string; messages: Map<string, AgentSourceMessage> },
) => EnvelopeItem | null;

function itemBase(item: HostItem) {
  return {
    id: item.id,
    source: item.source,
    conversationId: null,
    threadId: null,
    messageId: null,
  };
}

const renderers: Record<TriggerDefinition["envelope"], ItemRenderer> = {
  // An owner message: the author is as device/sources names them.
  message: (item, context) => {
    const ref = item.sourceRef;
    const base = itemBase(item);
    if (ref.source !== "owner_message") return null;
    const message = context.messages.get(ref.messageId);
    if (!message) return null;
    return {
      ...base,
      author: message.author.name,
      authorKind: message.author.kind,
      conversationId: message.conversationId,
      threadId: message.threadId,
      messageId: ref.messageId,
      body: message.body,
    };
  },
  decision: (item) => {
    const ref = item.sourceRef;
    const base = itemBase(item);
    if (ref.source !== "answer" && ref.source !== "approval_result") return null;
    const { request } = item;
    const lines = request
      ? decisionLines(ref.source, request)
      : [
          ref.source === "answer"
            ? `Your owner answered request ${ref.requestId}. The answer is not available.`
            : `Your owner decided on proposal ${ref.requestId}. The result is not available.`,
        ];
    if (item.body) lines.push(item.body);
    return {
      ...base,
      // The answer is the owner's words; a proposal's outcome is reported by the system.
      author: null,
      authorKind: ref.source === "answer" ? "owner" : "system",
      conversationId: request?.conversationId ?? null,
      threadId: request?.threadId ?? null,
      body: lines.join("\n"),
    };
  },
  helper_task: (item) => ({
    ...itemBase(item),
    author: "Parent agent",
    authorKind: "agent",
    body: item.body ?? "",
  }),
  helper_result: (item) => {
    const ref = item.sourceRef;
    if (ref.source !== "helper_result") return null;
    return {
      ...itemBase(item),
      author: `Helper ${ref.helperId}`,
      authorKind: "agent",
      body: item.body ?? "",
    };
  },
  routine: (item) => {
    const ref = item.sourceRef;
    if (ref.source !== "routine") return null;
    return {
      ...itemBase(item),
      author: null,
      authorKind: "system",
      body: `Routine ${ref.routineId} (scheduled ${ref.scheduledAt}):\n${item.body ?? ""}`,
    };
  },
  system: (item) => ({
    ...itemBase(item),
    author: null,
    authorKind: "system",
    body: item.body ?? "",
  }),
};
