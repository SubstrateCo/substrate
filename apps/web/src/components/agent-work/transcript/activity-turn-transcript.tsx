import { useQuery } from "@tanstack/react-query";

import { TurnTranscript } from "./turn-transcript";
import { isAccessFailure } from "@/api/access-failure";
import { useWorkspaceScope } from "@/components/workspace/workspace-scope-context";
import { needsYouOptions, turnOptions } from "@/queries/agent-work/server";

export function ActivityTurnTranscript({
  agentId,
  agentName,
  device,
  turnId,
  onClose,
}: {
  agentId: string;
  agentName: string;
  device?: string;
  turnId: string;
  onClose: () => void;
}) {
  const { userId, organizationId } = useWorkspaceScope();
  const found = useQuery(turnOptions(userId, organizationId, turnId));
  const needsYou = useQuery(needsYouOptions(userId, organizationId));
  const turn = found.data?.userAgentId === agentId ? found.data : undefined;
  const gone = (found.isSuccess && !turn) || isAccessFailure(found.error);
  return (
    <TurnTranscript
      turn={turn}
      turnLoading={found.isPending}
      turnError={found.error}
      onRetryTurn={() => void found.refetch()}
      agentName={agentName}
      device={device}
      requests={needsYou.data?.requests ?? []}
      unavailable={gone ? "This work is no longer available." : undefined}
      onClose={onClose}
    />
  );
}
