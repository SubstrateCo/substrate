import { useQuery } from "@tanstack/react-query";

import { CallsLogView } from "./calls-log-view";
import { useWorkspaceScope } from "@/components/workspace/workspace-scope-context";
import { callsLogOptions } from "@/queries/agent-work/calls";

export function CallsLog({ agentId }: { agentId: string }) {
  const { userId, organizationId } = useWorkspaceScope();
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
