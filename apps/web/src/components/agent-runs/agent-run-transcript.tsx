import { useQuery } from "@tanstack/react-query";

import { AgentRunTranscript as AgentRunTranscriptView } from "./agent-run-transcript-view";
import { agentRunOptions } from "@/queries/agent-runs/options";

export function AgentRunTranscript({
  userId,
  organizationId,
  runId,
  name,
  onClose,
}: {
  userId: string;
  organizationId: string;
  runId: string;
  name: string;
  onClose: () => void;
}) {
  const run = useQuery(agentRunOptions(userId, organizationId, runId));
  return (
    <AgentRunTranscriptView
      name={name}
      run={run.data}
      loading={run.isPending}
      error={run.error}
      onRetry={() => void run.refetch()}
      onClose={onClose}
    />
  );
}
