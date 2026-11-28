import type { TurnKind } from "../harness-runtime/runtime.ts";
import type { InboxSource } from "./turns.ts";
import type { AgentSessionKind } from "./wakes.ts";

/** system marks items the runtime wrote, such as routine ticks and resume notes. */
export type EnvelopeAuthorKind = "owner" | "member" | "agent" | "system";

export interface EnvelopeItem {
  /** The inbox item ID. */
  id: string;
  source: InboxSource;
  author: string | null;
  authorKind: EnvelopeAuthorKind;
  conversationId: string | null;
  threadId: string | null;
  /** The workspace message the item shows, for tools that take a message ID. */
  messageId: string | null;
  body: string;
}

/** What a recovery item tells the agent about the interrupted attempt. */
export interface EnvelopeResumeNote {
  turnId: string;
  previousAttempt: number;
  /** Tool calls that finished before the interruption. */
  completedTools: string[];
  /** Outputs already published, so the agent does not repeat them. */
  outputs: string[];
}

/** The clock of the desktop that runs the turn, which is the owner's own. */
export interface EnvelopeLocalTime {
  /** The local date and time with its UTC offset, such as 2026-11-27T21:02:49-05:00. */
  time: string;
  weekday: string;
  /** The IANA time zone, such as America/New_York. */
  timezone: string;
}

export interface EnvelopeTurn {
  time: string;
  /** Omitted by callers that have no desktop clock. */
  local?: EnvelopeLocalTime;
  session: AgentSessionKind;
  kind: TurnKind;
  attempt: number;
  /** Workspace changes since the previous turn, such as renamed conversations. Omitted when empty. */
  changes: string[];
  items: EnvelopeItem[];
  resume: EnvelopeResumeNote | null;
}
