import type {
  AgentRequestKind,
  TurnEventView,
  TurnOutputView,
} from "@substrate/contracts/agent-work";

type StepState = "done" | "current" | "error";

export type TranscriptEntry =
  | { type: "text"; key: string; text: string }
  | { type: "step"; key: string; text: string; state: StepState }
  | { type: "request"; key: string; requestId: string; kind: AgentRequestKind }
  | { type: "output"; key: string; output: TurnOutputView }
  | { type: "input"; key: string }
  | { type: "note"; key: string; text: string }
  | { type: "error"; key: string; text: string }
  | { type: "attempt"; key: string; attempt: number };

/**
 * The canonical turn events as transcript entries. A tool's start and completion become one
 * step; the last open step is current while the turn works. A new attempt starts a section.
 */
export function transcriptEntries(
  events: readonly TurnEventView[],
  working: boolean,
): TranscriptEntry[] {
  const entries: TranscriptEntry[] = [];
  const tools = new Map<string, Extract<TranscriptEntry, { type: "step" }>>();
  let attempt = events[0]?.attempt ?? 1;
  for (const event of events) {
    const key = `${event.attempt}:${event.seq}`;
    if (event.attempt !== attempt) {
      attempt = event.attempt;
      entries.push({ type: "attempt", key: `a${key}`, attempt });
      // An interrupted attempt leaves its open tools unfinished.
      for (const step of tools.values()) if (step.state === "current") step.state = "error";
      tools.clear();
    }
    switch (event.kind) {
      case "text":
        entries.push({ type: "text", key, text: event.data.text });
        break;
      case "activity":
        entries.push({ type: "step", key, text: event.data.text, state: "done" });
        break;
      case "tool_started": {
        const step: Extract<TranscriptEntry, { type: "step" }> = {
          type: "step",
          key,
          text: event.data.title,
          state: event.itemId ? "current" : "done",
        };
        entries.push(step);
        if (event.itemId) tools.set(event.itemId, step);
        break;
      }
      case "tool_completed": {
        const step = event.itemId ? tools.get(event.itemId) : undefined;
        if (step) step.state = event.data.status === "failed" ? "error" : "done";
        break;
      }
      case "request":
        entries.push({
          type: "request",
          key,
          requestId: event.data.requestId,
          kind: event.data.kind,
        });
        break;
      case "output":
        entries.push({ type: "output", key, output: event.data });
        break;
      case "input_consumed":
        entries.push({ type: "input", key });
        break;
      case "note":
        entries.push({ type: "note", key, text: event.data.text });
        break;
      case "error":
        entries.push({ type: "error", key, text: event.data.message });
        break;
      case "turn_started":
      case "turn_finished":
      case "request_resolved":
      case "input_submitted":
      case "usage":
        break;
    }
  }
  // A tool that never completed in a stopped turn did not finish.
  if (!working)
    for (const step of tools.values()) if (step.state === "current") step.state = "error";
  return entries;
}
