import type { AgentTurnView, TurnOutcome } from "@substrate/contracts/agent-work";

import { useInfiniteQuery, useQuery } from "@tanstack/react-query";

import { NeedsAttention } from "../needs-attention";
import { hiddenConversation } from "../requests/proposal-preview";
import { TurnStatusTag } from "../turn-work";
import { AgentActivityView, type ActivityRow } from "./agent-activity-view";
import { failedWorkNote, sessionKindLabels, turnStatus } from "@/lib/agent-work/status";
import { conversationName } from "@/lib/messaging/conversations";
import { agentActivityOptions } from "@/queries/agent-work/local";
import { conversationsQueryOptions } from "@/queries/messaging/options";

const outcomeLabels: Record<TurnOutcome, string> = {
  replied: "Replied",
  // The tag already says "Checked · nothing to report".
  silent: "Checked in",
  asked: "Asked you a question",
  proposed: "Proposed an action",
};

/** The subject of work that has no activity line or outcome yet. The state shows in the tag. */
const subjectFallbacks: Record<AgentTurnView["sessionKind"], string> = {
  dm: "Work on your message",
  thread: "Work in a thread",
  routine: "Routine run",
  helper: "Helper task",
};

/** The conversation a turn answered or wrote to: its output first, then its newest source. */
function placeOf(turn: AgentTurnView) {
  const output = turn.outputs.filter((entry) => entry.kind === "message").at(-1);
  if (output) return output.conversationId;
  return turn.sourceMessages.at(-1)?.conversationId;
}

/** One agent's work on its home desktop, including silent, routine, and helper work. */
export function AgentActivity({
  userId,
  organizationId,
  agentId,
  name,
  selectedTurnId,
  onTranscript,
}: {
  userId: string;
  organizationId: string;
  agentId: string;
  name: string;
  selectedTurnId?: string;
  onTranscript: (turnId: string) => void;
}) {
  const activity = useInfiniteQuery(agentActivityOptions(userId, organizationId, agentId));
  const conversations = useQuery(conversationsQueryOptions(organizationId));
  // The list shows each turn's start time, so it is ordered by that time, newest first.
  const turns = (activity.data?.pages.flatMap((page) => page.turns) ?? []).sort(
    (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
  );
  // Name only conversations the viewer can open now. Others stay placeholders.
  const place = (turn: AgentTurnView) => {
    const conversationId = placeOf(turn);
    if (!conversationId) return undefined;
    const conversation = conversations.data?.find((entry) => entry.id === conversationId);
    return conversation ? `In ${conversationName(conversation)}` : hiddenConversation;
  };
  const rows: ActivityRow[] = turns.map((turn) => {
    // The tone does not depend on the clock; the tag shows the time with its own clock.
    const failed = turnStatus(turn, 0).tone === "failed";
    return {
      id: turn.id,
      summary:
        turn.activity ??
        (turn.outcome ? outcomeLabels[turn.outcome] : undefined) ??
        subjectFallbacks[turn.sessionKind],
      // Reviewed copy only. The runtime's message is under Technical details in the transcript.
      note: failed ? failedWorkNote : undefined,
      place: place(turn),
      kind: sessionKindLabels[turn.sessionKind],
      status: <TurnStatusTag turn={turn} />,
      createdAt: turn.createdAt,
      selected: turn.id === selectedTurnId,
      attention: turn.status === "needs_attention" && (
        <NeedsAttention
          userId={userId}
          organizationId={organizationId}
          turn={turn}
          agentName={name}
          inline
        />
      ),
    };
  });
  return (
    <AgentActivityView
      name={name}
      rows={rows}
      helpers={(activity.data?.pages.flatMap((page) => page.helpers) ?? []).map((helper) => ({
        id: helper.id,
        task: helper.task,
        status: helper.status,
        report: helper.report,
      }))}
      loading={activity.isPending}
      error={activity.error}
      onRetry={() => void activity.refetch()}
      hasMore={activity.hasNextPage}
      loadingMore={activity.isFetchingNextPage}
      onMore={() => void activity.fetchNextPage()}
      onTranscript={onTranscript}
    />
  );
}
