import type {
  AgentWorkHelperView,
  AgentWorkTurnView,
  TurnOutcome,
} from "@substrate/contracts/agent-work";

import { useInfiniteQuery, useQuery } from "@tanstack/react-query";

import { NeedsAttention } from "../needs-attention";
import { NeedsAttentionInline } from "../needs-attention-card";
import { TurnStatusTag } from "../turn-work";
import {
  AgentActivityView,
  type ActivityItem,
  type ActivityRow,
  type HelperRow,
} from "./agent-activity-view";
import { useWorkspaceScope } from "@/components/workspace/workspace-scope-context";
import { groupActivity } from "@/lib/agent-work/activity-groups";
import { hiddenConversation } from "@/lib/agent-work/hidden-records";
import { turnConversation } from "@/lib/agent-work/placement";
import { failedWorkNote, sessionKindLabels, turnTone } from "@/lib/agent-work/status";
import { conversationName } from "@/lib/messaging/conversations";
import { agentActivityOptions } from "@/queries/agent-work/server";
import { conversationsQueryOptions } from "@/queries/messaging/options";

const outcomeLabels: Record<TurnOutcome, string> = {
  replied: "Replied",
  silent: "Checked in",
  asked: "Asked you a question",
  proposed: "Proposed an action",
};

const subjectFallbacks: Record<AgentWorkTurnView["sessionKind"], string> = {
  dm: "Work on your message",
  thread: "Work in a thread",
  routine: "Routine run",
  helper: "Helper task",
};

const hiddenHelperTask = "A task from a conversation you can't open";

function helperRow(helper: AgentWorkHelperView): HelperRow {
  return {
    id: helper.id,
    task: helper.task ?? hiddenHelperTask,
    status: helper.status,
    report: helper.report,
  };
}

export function AgentActivity({
  agentId,
  name,
  selectedTurnId,
  onTranscript,
}: {
  agentId: string;
  name: string;
  selectedTurnId?: string;
  onTranscript: (turnId: string) => void;
}) {
  const { userId, organizationId } = useWorkspaceScope();
  const activity = useInfiniteQuery(agentActivityOptions(userId, organizationId, agentId));
  const conversations = useQuery(conversationsQueryOptions(organizationId));
  const turns = (activity.data?.pages.flatMap((page) => page.turns) ?? []).sort(
    (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
  );
  const turnsById = new Map(turns.map((turn) => [turn.id, turn]));
  const place = (turn: AgentWorkTurnView) => {
    if (!turn.placeVisible) return hiddenConversation;
    const conversationId = turnConversation(turn, turnsById);
    if (!conversationId) return undefined;
    const conversation = conversations.data?.find((entry) => entry.id === conversationId);
    return conversation ? `In ${conversationName(conversation)}` : hiddenConversation;
  };
  const row = (turn: AgentWorkTurnView): ActivityRow => {
    const failed = turnTone(turn) === "failed";
    return {
      id: turn.id,
      summary:
        turn.activity ??
        (turn.outcome ? outcomeLabels[turn.outcome] : undefined) ??
        subjectFallbacks[turn.sessionKind],
      note: failed ? failedWorkNote : undefined,
      place: place(turn),
      kind: sessionKindLabels[turn.sessionKind],
      status: <TurnStatusTag turn={turn} />,
      createdAt: turn.createdAt,
      selected: turn.id === selectedTurnId,
      attention: turn.status === "needs_attention" && (
        <NeedsAttentionInline>
          <NeedsAttention turn={turn} agentName={name} />
        </NeedsAttentionInline>
      ),
    };
  };
  const items: ActivityItem[] = groupActivity(turns).map((entry) =>
    entry.kind === "turn"
      ? { kind: "row", row: row(entry.turn) }
      : { kind: "routines", id: entry.id, rows: entry.turns.map(row) },
  );
  return (
    <AgentActivityView
      name={name}
      items={items}
      helpers={activity.data?.pages.flatMap((page) => page.helpers.map(helperRow)) ?? []}
      loading={activity.isPending}
      error={activity.error}
      onRetry={() => void activity.refetch()}
      hasMore={activity.hasNextPage}
      loadingMore={activity.isFetchingNextPage}
      onMore={() => {
        // A next page during a refresh would cancel the refresh.
        if (!activity.isFetching) void activity.fetchNextPage();
      }}
      onTranscript={onTranscript}
    />
  );
}
