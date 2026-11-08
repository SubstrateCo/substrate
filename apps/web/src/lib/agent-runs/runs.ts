import type {
  AgentRunRequestPayload,
  AgentRunRequestResponse,
  AgentRunRequestView,
  AgentRunView,
} from "@startup-os/contracts/agent-runs";

// The server cancels a request it has not received an answer for after this time.
const requestTimeoutMs = 10 * 60_000;

/**
 * The latest run for each message. A batched run lists several trigger messages; its card goes
 * under the last one only, so its controls appear once.
 */
export function latestRunByMessage(runs: readonly AgentRunView[]) {
  const latest = new Map<string, AgentRunView>();
  for (const run of runs) {
    const messageId = run.triggerMessageIds.at(-1);
    if (!messageId) continue;
    const current = latest.get(messageId);
    if (!current || Date.parse(run.createdAt) > Date.parse(current.createdAt))
      latest.set(messageId, run);
  }
  return latest;
}

export function pendingRequest(run: AgentRunView): AgentRunRequestView | undefined {
  return run.requests.find((request) => request.status === "pending");
}

export function requestExpiresAt(request: Pick<AgentRunRequestView, "createdAt">) {
  return Date.parse(request.createdAt) + requestTimeoutMs;
}

/** Compact elapsed or remaining time, such as 45s, 3m 05s, or 1h 02m. */
export function formatDuration(ms: number) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  const pad = (value: number) => String(value).padStart(2, "0");
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${pad(seconds % 60)}s`;
  return `${Math.floor(minutes / 60)}h ${pad(minutes % 60)}m`;
}

type Questions = Extract<AgentRunRequestPayload, { type: "questions" }>["questions"];
export type QuestionDraft = { selected: string[]; custom: string };

/** Selected options first, then the typed answer. Empty answers are left out. */
export function questionAnswer(draft: QuestionDraft | undefined) {
  const custom = draft?.custom.trim();
  return [...(draft?.selected ?? []), ...(custom ? [custom] : [])];
}

export function questionsResponse(
  questions: Questions,
  drafts: Partial<Record<string, QuestionDraft>>,
): Extract<AgentRunRequestResponse, { type: "questions" }> {
  return {
    type: "questions",
    answers: Object.fromEntries(
      questions.map((question) => [question.id, questionAnswer(drafts[question.id])]),
    ),
  };
}

/** Single-select replaces the choice. Multi-select toggles it. */
export function toggleQuestionOption(
  draft: QuestionDraft | undefined,
  label: string,
  multiSelect: boolean,
): QuestionDraft {
  const selected = draft?.selected ?? [];
  if (!multiSelect) return { selected: [label], custom: "" };
  return {
    selected: selected.includes(label)
      ? selected.filter((item) => item !== label)
      : [...selected, label],
    custom: draft?.custom ?? "",
  };
}

/** A typed answer replaces a single-select choice. */
export function setQuestionCustom(
  draft: QuestionDraft | undefined,
  custom: string,
  multiSelect: boolean,
): QuestionDraft {
  return { selected: multiSelect ? (draft?.selected ?? []) : [], custom };
}
