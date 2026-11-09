import { useQuery } from "@tanstack/react-query";

import { AgentRunTranscript as AgentRunTranscriptView } from "./agent-run-transcript-view";
import { AgentRunRequest } from "./requests/agent-run-request";
import { ApiError } from "@/api/result";
import { actionErrorMessage } from "@/components/feedback/action-error-message";
import { useNow } from "@/hooks/use-now";
import { runStatus } from "@/lib/agent-runs/runs";
import { messageHref } from "@/lib/navigation/record-links";
import { agentRunOptions, useAgentRunActions } from "@/queries/agent-runs/options";
import { toast } from "sonner";

export function AgentRunTranscript({
  userId,
  organizationId,
  runId,
  onClose,
}: {
  userId: string;
  organizationId: string;
  runId: string;
  onClose: () => void;
}) {
  const run = useQuery(agentRunOptions(userId, organizationId, runId));
  const { cancel, respond } = useAgentRunActions(userId, organizationId);
  const now = useNow(run.data?.status === "running");
  const status = run.data && runStatus(run.data, now);
  const active = run.data?.status === "queued" || run.data?.status === "running";
  const source = run.data?.triggerMessageIds.at(-1);
  return (
    <AgentRunTranscriptView
      name={run.data?.agent.name ?? "Agent"}
      run={run.data}
      tone={status?.tone}
      label={status?.label}
      loading={run.isPending}
      error={run.error}
      onRetry={() => void run.refetch()}
      onClose={onClose}
      sourceHref={
        run.data && source
          ? messageHref(organizationId, run.data.conversationId, source)
          : undefined
      }
      onStop={
        active
          ? () =>
              cancel.mutate(runId, {
                onError: (error) =>
                  toast.error(actionErrorMessage(error, "We couldn’t stop this run. Try again.")),
              })
          : undefined
      }
      stopping={cancel.isPending}
      renderRequest={(request) => (
        <AgentRunRequest
          request={request}
          pending={respond.isPending}
          onRespond={(response) =>
            respond.mutate(
              { requestId: request.id, response },
              {
                onError: (error) =>
                  toast.error(
                    error instanceof ApiError && error.code === "CONFLICT"
                      ? "Already answered"
                      : actionErrorMessage(error, "We couldn’t send your answer. Try again."),
                  ),
              },
            )
          }
        />
      )}
    />
  );
}
