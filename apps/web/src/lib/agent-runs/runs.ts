import type {
  AgentRunEventView,
  AgentRunRequestPayload,
  AgentRunRequestResponse,
  AgentRunRequestView,
  AgentRunView,
} from "@startup-os/contracts/agent-runs";

// The server cancels a request it has not received an answer for after this time.
const requestTimeoutMs = 10 * 60_000;

export type RunPlacement = { run: AgentRunView; kind: "reply" | "pending" };

/**
 * Where each run shows. A run that replied shows under its latest reply. A run without a reply
 * yet shows as a pending reply under its last trigger message; when several runs share that
 * message, only the latest one shows there, so its controls appear once.
 */
export function runPlacements(runs: readonly AgentRunView[]) {
  const placements = new Map<string, RunPlacement>();
  const pending = new Map<string, AgentRunView>();
  for (const run of runs) {
    const reply = run.replyMessageIds.at(-1);
    if (reply) {
      placements.set(reply, { run, kind: "reply" });
      continue;
    }
    const trigger = run.triggerMessageIds.at(-1);
    if (!trigger) continue;
    const current = pending.get(trigger);
    if (!current || Date.parse(run.createdAt) > Date.parse(current.createdAt))
      pending.set(trigger, run);
  }
  for (const [messageId, run] of pending)
    if (!placements.has(messageId)) placements.set(messageId, { run, kind: "pending" });
  return placements;
}

export type RunTone = "idle" | "working" | "attention" | "done" | "failed";
export type RunStatus = { tone: RunTone; label: string };

/** The run's state as one tone and one short line, such as "Working for 1m 05s". */
export function runStatus(run: AgentRunView, now: number): RunStatus {
  const request = pendingRequest(run);
  if (request)
    return {
      tone: "attention",
      label: request.payload.type === "approval" ? "Needs your approval" : "Needs your answer",
    };
  const started = Date.parse(run.startedAt ?? run.createdAt);
  const ran = () => formatDuration((run.finishedAt ? Date.parse(run.finishedAt) : now) - started);
  switch (run.status) {
    case "queued":
      if (!run.device) return { tone: "idle", label: "Queued · no desktop is set to run it" };
      return {
        tone: "idle",
        label: run.device.online
          ? `Queued · waiting for ${run.device.name}`
          : `Queued · ${run.device.name} is offline`,
      };
    case "running":
      return { tone: "working", label: `Working for ${ran()}` };
    case "completed":
      return { tone: "done", label: `Worked for ${ran()}` };
    case "failed":
      return { tone: "failed", label: run.startedAt ? `Failed after ${ran()}` : "Failed" };
    case "cancelled":
      return { tone: "idle", label: "Stopped" };
    case "expired":
      return { tone: "idle", label: "Expired before it ran" };
  }
}

export type RunStep = { key: string; text: string; state: "done" | "current" | "error" };

// The desktop runner records this marker when a turn starts. It is not a step.
const startMarker = "Working";

/** Tool activity and errors as steps. The last activity is current while the run works. */
export function runSteps(
  events: readonly Pick<AgentRunEventView, "sequence" | "kind" | "text">[],
  working: boolean,
): RunStep[] {
  const steps = events.flatMap((event): RunStep[] =>
    event.kind === "text" || event.text === startMarker
      ? []
      : [
          {
            key: String(event.sequence),
            text: event.text,
            state: event.kind === "error" ? "error" : "done",
          },
        ],
  );
  const last = steps.at(-1);
  if (working && last?.state === "done") last.state = "current";
  return steps;
}

function pendingRequest(run: AgentRunView): AgentRunRequestView | undefined {
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
