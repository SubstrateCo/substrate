import { useQuery } from "@tanstack/react-query";

import { TurnTranscript } from "./turn-transcript";
import { turnOptions } from "@/queries/agent-work/local";
import { needsYouOptions } from "@/queries/agent-work/server";

/** The transcript beside an agent's activity in the Agents app, also for /agents?turnId links. */
export function ActivityTurnTranscript({
  userId,
  organizationId,
  agentId,
  agentName,
  homedHere,
  device,
  turnId,
  onClose,
}: {
  userId: string;
  organizationId: string;
  agentId: string;
  agentName: string;
  homedHere: boolean;
  device?: string;
  turnId: string;
  onClose: () => void;
}) {
  const found = useQuery({ ...turnOptions(userId, organizationId, turnId), enabled: homedHere });
  const needsYou = useQuery(needsYouOptions(userId, organizationId));
  // A link may name a turn of another agent; show it only under its own agent.
  const turn = found.data?.userAgentId === agentId ? found.data : undefined;
  let unavailable: string | undefined;
  if (!homedHere) unavailable = device ? `Open on ${device}` : "No desktop runs this agent";
  else if (found.isSuccess && !turn) unavailable = "This work is no longer on this desktop.";
  return (
    <TurnTranscript
      userId={userId}
      organizationId={organizationId}
      turn={turn}
      turnLoading={found.isPending}
      turnError={found.error}
      onRetryTurn={() => void found.refetch()}
      agentName={agentName}
      requests={needsYou.data?.requests ?? []}
      unavailable={unavailable}
      onClose={onClose}
    />
  );
}
