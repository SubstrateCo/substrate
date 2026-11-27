import type {
  AgentRequestView,
  AgentStatusView,
  AgentWorkItemView,
  AgentWorkTurnView,
  TurnAttentionReason,
} from "@substrate/contracts/agent-work";

import { formatDuration, ordinal } from "./time";

export type WorkTone = "idle" | "working" | "attention" | "done" | "failed" | "muted";
export type WorkStatus = { tone: WorkTone; label: string };

export const silentLabel = "Checked · nothing to report";
export const steeredLabel = "Added to current work";
export const noDesktopLabel = "No desktop runs this agent";

/** Where to see a transcript, which only the desktop that ran the work stores. */
export const transcriptNotice = (deviceName?: string) =>
  deviceName
    ? `Open Substrate on ${deviceName} to see this transcript.`
    : "Open the desktop app that runs this agent to see its transcript.";
const resumedLabel = "Resumed after interruption";
export const stoppedNeedsYouLabel = "Stopped · needs you";

const offline = (device: string) => `Waiting for ${device} · offline`;

/** The label for an open request, which comes before every other state of its turn. */
function requestLabel(request: Pick<AgentRequestView, "kind">) {
  return request.kind === "question" ? "Needs your answer" : "Needs your approval";
}

/** One turn's tone. It does not depend on the clock. */
export function turnTone(
  turn: AgentWorkTurnView,
  openRequest?: Pick<AgentRequestView, "kind">,
): WorkTone {
  if (openRequest) return "attention";
  switch (turn.status) {
    case "needs_attention":
      return "attention";
    case "assigned":
    case "running":
    case "waiting":
    case "stopping":
      return "working";
    case "completed":
      return turn.outcome === "silent" ? "muted" : "done";
    case "cancelled":
    case "interrupted":
      return "idle";
    case "failed":
      return "failed";
  }
}

/** The orb's animation for live work. Each name is a state of the `thinking-orbs` orb. */
export type WorkOrbState = "breathing" | "connecting" | "solving" | "listening";

/** Queued work waits calmly for its turn. */
export const queuedOrb: WorkOrbState = "breathing";

/**
 * The orb animation for a live turn, or null when the work has ended: connecting while it
 * starts, solving while it runs, listening while it waits for the owner, and breathing while
 * it stops.
 */
export function turnOrb(
  turn: AgentWorkTurnView,
  openRequest?: Pick<AgentRequestView, "kind">,
): WorkOrbState | null {
  switch (turn.status) {
    case "assigned":
      return openRequest ? "listening" : "connecting";
    case "running":
      return openRequest ? "listening" : "solving";
    case "waiting":
      return "listening";
    case "stopping":
      return "breathing";
    case "completed":
    case "cancelled":
    case "interrupted":
    case "needs_attention":
    case "failed":
      return null;
  }
}

/** One turn as one short line, such as "Working · 1m 05s". */
export function turnLabel(
  turn: AgentWorkTurnView,
  now: number,
  openRequest?: Pick<AgentRequestView, "kind">,
): string {
  if (openRequest) return requestLabel(openRequest);
  const started = Date.parse(turn.startedAt ?? turn.createdAt);
  const ran = () => formatDuration((turn.finishedAt ? Date.parse(turn.finishedAt) : now) - started);
  const resumed = turn.attempt > 1 || turn.resumesTurnId !== null;
  switch (turn.status) {
    case "needs_attention":
      return stoppedNeedsYouLabel;
    case "assigned":
      return resumed ? resumedLabel : "Starting";
    case "running":
    case "waiting":
      return resumed ? `${resumedLabel} · ${ran()}` : `Working · ${ran()}`;
    case "stopping":
      return "Stopping";
    case "completed":
      return turn.outcome === "silent" ? silentLabel : `Worked for ${ran()}`;
    case "cancelled":
      return "Stopped";
    case "interrupted":
      return "Stopped for your new message";
    case "failed":
      return turn.startedAt ? `Failed after ${ran()}` : "Failed";
  }
}

// Every contract reason needs its own text.
const attentionReasons = {
  unfinished_tool: () =>
    "The work stopped while a tool was still running, so it may have finished only part of a change.",
  uncertain_input: (agentName) => uncertainItemLabel(agentName),
  resume_failed: (agentName) => `${agentName} couldn’t pick up its previous session.`,
  interrupted_again: () => "The work was interrupted twice.",
  failed: () => "The work failed.",
} satisfies Record<TurnAttentionReason, (agentName: string) => string>;
export const attentionFallback = "The work stopped and needs you to decide what happens next.";

/** Why a turn needs the owner, for the needs-attention card. */
export function attentionReasonText(reason: TurnAttentionReason | null, agentName: string) {
  return reason ? attentionReasons[reason](agentName) : attentionFallback;
}

/** Reviewed copy for work that failed. The runtime's own message is a diagnostic, shown apart. */
export const failedWorkNote = "The work didn’t finish. Open the transcript to see what happened.";

/** What the inbox receipt under an owner message needs to know about the agent. */
export interface ItemContext {
  agentName: string;
  /** Owner items of other sessions that wait ahead of this one. */
  ahead: number;
  /** The agent has live work in another session. */
  busy: boolean;
  /** Undefined while the agent's status is unknown. */
  device?: AgentStatusView["device"];
}

/** sendNow offers Send now. uncertain offers Resend and Discard. */
export type ItemStatus = WorkStatus & { sendNow: boolean; uncertain: boolean };

const uncertainItemLabel = (agentName: string) =>
  `We couldn’t confirm ${agentName} received this message`;

/** An owner message that waits for its session's next turn, which Send now cannot hurry. */
export const waits = (item: AgentWorkItemView) =>
  item.lane === "owner" &&
  !item.held &&
  (item.status === "pending" || item.status === "confirmed_unconsumed");

/**
 * How many other sessions of the same agent wait ahead of this item's session. The claim loop
 * takes the session with the oldest waiting owner item first. Pass the items of one agent.
 */
export function queueAhead(item: AgentWorkItemView, items: readonly AgentWorkItemView[]) {
  const oldest = new Map<string, number>();
  for (const entry of items) {
    if (!waits(entry)) continue;
    const at = Date.parse(entry.availableAt);
    const current = oldest.get(entry.sessionId);
    if (current === undefined || at < current) oldest.set(entry.sessionId, at);
  }
  const own = oldest.get(item.sessionId) ?? Date.parse(item.availableAt);
  let ahead = 0;
  for (const [sessionId, at] of oldest) if (sessionId !== item.sessionId && at < own) ahead++;
  return ahead;
}

/** An owner message that has not finished in a turn yet. */
export function itemStatus(item: AgentWorkItemView, context: ItemContext): ItemStatus {
  const status = (tone: WorkTone, label: string, sendNow = false) => ({
    tone,
    label,
    sendNow,
    uncertain: false,
  });
  if (item.status === "submitted" || item.status === "consumed")
    return status("idle", steeredLabel);
  if (item.status === "uncertain")
    return { ...status("attention", uncertainItemLabel(context.agentName)), uncertain: true };
  if (item.status === "dropped") return status("muted", "Skipped · no longer available");
  if (item.status === "superseded" || item.status === "expired") return status("muted", "Skipped");
  if (item.held) return status("idle", `Waiting · ${context.agentName} is busy`, true);
  if (context.device === null) return status("idle", noDesktopLabel);
  if (context.device && !context.device.online) return status("idle", offline(context.device.name));
  if (context.ahead > 0) return status("idle", `Queued · ${ordinal(context.ahead + 1)} in line`);
  if (context.busy) return status("idle", "Queued · after other work");
  return status("idle", "Queued");
}

/**
 * The agent's status as the server derives it. It has no per-message detail, so it describes
 * the agent as a whole.
 */
export function agentStatus(status: AgentStatusView): WorkStatus {
  const { device } = status;
  if (status.state === "needs_you") return { tone: "attention", label: "Needs you" };
  if (!device) return { tone: "idle", label: noDesktopLabel };
  if (!device.online)
    return status.state === "idle"
      ? { tone: "idle", label: `${device.name} is offline` }
      : { tone: "idle", label: offline(device.name) };
  if (status.state === "working")
    return {
      tone: "working",
      label: status.activity
        ? `Working on ${device.name} · ${status.activity}`
        : `Working on ${device.name}`,
    };
  if (status.state === "queued")
    return {
      tone: "idle",
      label: `Queued on ${device.name} · ${status.queuedCount} waiting`,
    };
  return { tone: "idle", label: "Idle" };
}

export const sessionKindLabels = {
  dm: "Direct message",
  thread: "Thread",
  routine: "Routine",
  helper: "Helper",
};
