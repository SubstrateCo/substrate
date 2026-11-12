import { useQuery } from "@tanstack/react-query";

import { CallsLogView } from "./calls-log-view";
import { callsLogOptions } from "@/queries/agent-work/calls";

export function CallsLog({
  userId,
  organizationId,
  agentId,
}: {
  userId: string;
  organizationId: string;
  agentId: string;
}) {
  const log = useQuery(callsLogOptions(userId, organizationId, agentId));
  return (
    <CallsLogView
      entries={log.data ?? []}
      loading={log.isPending}
      error={log.error}
      onRetry={() => void log.refetch()}
    />
  );
}
