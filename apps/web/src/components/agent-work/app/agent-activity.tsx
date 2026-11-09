import type { AgentStatusView } from "@startup-os/contracts/agent-work";
import { liveTurnStatuses } from "@startup-os/contracts/agent-work";

import { useInfiniteQuery } from "@tanstack/react-query";

import { NeedsAttention } from "../needs-attention";
import { Routines } from "../routines/routines";
import { AgentActivityView, type ActivityRow } from "./agent-activity-view";
import { useNow } from "@/hooks/use-now";
import { agentStatus, noDesktopLabel, turnStatus } from "@/lib/agent-work/status";
import { agentActivityOptions } from "@/queries/agent-work/local";

const kinds = { dm: "Direct message", thread: "Thread", routine: "Routine", helper: "Helper" };

/**
 * One agent's activity. Local work is only on the agent's home desktop; other devices say where
 * to open it and show the status that desktop published.
 */
export function AgentActivity({
  userId,
  organizationId,
  agentId,
  name,
  homedHere,
  status,
  selectedTurnId,
  onTranscript,
}: {
  userId: string;
  organizationId: string;
  agentId: string;
  name: string;
  homedHere: boolean;
  status?: AgentStatusView;
  selectedTurnId?: string;
  onTranscript: (turnId: string) => void;
}) {
  const activity = useInfiniteQuery({
    ...agentActivityOptions(userId, organizationId, agentId),
    enabled: homedHere,
  });
  const turns = activity.data?.pages.flatMap((page) => page.turns) ?? [];
  const now = useNow(turns.some((turn) => liveTurnStatuses.includes(turn.status)));
  let unavailable: { title: string; description: string } | undefined;
  if (!homedHere)
    unavailable = status?.device
      ? {
          title: `Open on ${status.device.name}`,
          description: `${name} runs on ${status.device.name}. Its activity, transcripts, and routines are stored there.`,
        }
      : {
          title: noDesktopLabel,
          description: "Choose a desktop in agent settings. Work waits until a desktop runs it.",
        };
  const rows: ActivityRow[] = turns.map((turn) => ({
    id: turn.id,
    kind: kinds[turn.sessionKind],
    unattended: turn.kind === "unattended",
    status: turnStatus(turn, now),
    createdAt: turn.createdAt,
    selected: turn.id === selectedTurnId,
    attention: turn.status === "needs_attention" && (
      <NeedsAttention
        userId={userId}
        organizationId={organizationId}
        turn={turn}
        agentName={name}
      />
    ),
  }));
  return (
    <AgentActivityView
      name={name}
      status={status && agentStatus(status)}
      unavailable={unavailable}
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
      routines={<Routines userId={userId} organizationId={organizationId} agentId={agentId} />}
    />
  );
}
