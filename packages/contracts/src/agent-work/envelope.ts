import type { TurnKind } from "../harness/turn-context.ts";
import type { InboxSource } from "./turns.ts";
import type { AgentSessionKind } from "./wakes.ts";

// The turn input the desktop renders. Deterministic: items are sorted and every body is fenced.
//
// <turn time="ISO" session="dm" kind="interactive" attempt="1">
// <changes>…only when present…</changes>
// <item id="…" source="owner_message" author="Name" author_kind="owner" conversation="…" thread="…" message="…">…</item>
// </turn>

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

export interface EnvelopeTurn {
  time: string;
  session: AgentSessionKind;
  kind: TurnKind;
  attempt: number;
  /** Workspace changes since the previous turn, such as renamed conversations. Omitted when empty. */
  changes: string[];
  items: EnvelopeItem[];
  resume: EnvelopeResumeNote | null;
}
