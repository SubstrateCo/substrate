import type { Mood } from "@substrate/agent-avatars/config";
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

export const transcriptNotice = (deviceName?: string) =>
  deviceName
    ? `Open Substrate on ${deviceName} to see this transcript.`
    : "Open the desktop app that runs this agent to see its transcript.";
const resumedLabel = "Resumed after interruption";
export const stoppedNeedsYouLabel = "Stopped · needs you";

const offline = (device: string) => `Waiting for ${device} · offline`;

function requestLabel(request: Pick<AgentRequestView, "kind">) {
  return request.kind === "question" ? "Needs your answer" : "Needs your approval";
}

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

export type WorkMood = Extract<Mood, "thinking" | "working" | "listening" | "waiting">;

export const queuedMood: WorkMood = "waiting";

export function turnMood(
  turn: AgentWorkTurnView,
  openRequest?: Pick<AgentRequestView, "kind">,
): WorkMood | null {
  switch (turn.status) {
    case "assigned":
      return openRequest ? "listening" : "thinking";
    case "running":
      return openRequest ? "listening" : "working";
    case "waiting":
      return "listening";
    case "stopping":
      return "waiting";
    case "completed":
    case "cancelled":
    case "interrupted":
    case "needs_attention":
    case "failed":
      return null;
  }
}

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

const attentionReasons = {
  unfinished_tool: () =>
    "The work stopped while a tool was still running, so it may have finished only part of a change.",
  uncertain_input: (agentName) => uncertainItemLabel(agentName),
  resume_failed: (agentName) => `${agentName} couldn’t pick up its previous session.`,
  interrupted_again: () => "The work was interrupted twice.",
  failed: () => "The work failed.",
} satisfies Record<TurnAttentionReason, (agentName: string) => string>;
export const attentionFallback = "The work stopped and needs you to decide what happens next.";

export function attentionReasonText(reason: TurnAttentionReason | null, agentName: string) {
  return reason ? attentionReasons[reason](agentName) : attentionFallback;
}

export const failedWorkNote = "The work didn’t finish. Open the transcript to see what happened.";

export interface ItemContext {
  agentName: string;
  ahead: number;
  busy: boolean;
  device?: AgentStatusView["device"];
}

export type ItemStatus = WorkStatus & { sendNow: boolean; uncertain: boolean };

const uncertainItemLabel = (agentName: string) =>
  `We couldn’t confirm ${agentName} received this message`;

export const waits = (item: AgentWorkItemView) =>
  item.lane === "owner" &&
  !item.held &&
  (item.status === "pending" || item.status === "confirmed_unconsumed");

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

export type AgentHeaderStatus = WorkStatus & {
  mood: WorkMood | null;
  elsewhereConversationId: string | null;
};

export function agentHeaderStatus(
  status: AgentStatusView,
  homeConversationId: string | undefined,
): AgentHeaderStatus | null {
  const { device } = status;
  const line = (tone: WorkTone, label: string, mood: WorkMood | null = null) => ({
    tone,
    label,
    mood,
    elsewhereConversationId: null,
  });
  if (status.state === "needs_you") return line("attention", "Needs you");
  if (!device) return line("idle", noDesktopLabel);
  if (!device.online) return line("idle", `${device.name} is offline`);
  if (status.state === "working") {
    const place = status.liveConversationId;
    return {
      ...line("working", "Working", "working"),
      elsewhereConversationId: place && place !== homeConversationId ? place : null,
    };
  }
  if (status.state === "queued")
    return line(
      "idle",
      status.queuedCount > 1 ? `Queued · ${status.queuedCount}` : "Queued",
      queuedMood,
    );
  return null;
}

export const sessionKindLabels = {
  dm: "Direct message",
  thread: "Thread",
  routine: "Routine",
  helper: "Helper",
};
