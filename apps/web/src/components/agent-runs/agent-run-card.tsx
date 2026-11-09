import { useQuery } from "@tanstack/react-query";

import { useState } from "react";

import { AgentRunPendingReply } from "./agent-run-pending-reply";
import { AgentRunWork } from "./agent-run-work";
import { AgentRunRequest } from "./requests/agent-run-request";
import { ApiError } from "@/api/result";
import { actionErrorMessage } from "@/components/feedback/action-error-message";
import { useNow } from "@/hooks/use-now";
import { runStatus, runSteps, type RunPlacement } from "@/lib/agent-runs/runs";
import { agentRunOptions, useAgentRunActions } from "@/queries/agent-runs/options";
import { toast } from "sonner";

/**
 * One run, shown where it belongs: under the agent's reply, or as a pending reply under the
 * message that started it. The steps load only while they are open.
 */
export function AgentRunCard({
  userId,
  organizationId,
  placement,
  onTranscript,
}: {
  userId: string;
  organizationId: string;
  placement: RunPlacement;
  onTranscript: (runId: string) => void;
}) {
  const { run, kind } = placement;
  const active = run.status === "queued" || run.status === "running";
  const [chosen, setChosen] = useState<boolean>();
  const open = chosen ?? active;
  const now = useNow(run.status === "running");
  const status = runStatus(run, now);
  const detail = useQuery({ ...agentRunOptions(userId, organizationId, run.id), enabled: open });
  const { cancel, respond } = useAgentRunActions(userId, organizationId);
  // Show the open request, or how the latest one ended while the run continues.
  const request =
    run.requests.find((item) => item.status === "pending") ??
    (active ? run.requests.at(-1) : undefined);
  const work = (
    <AgentRunWork
      tone={status.tone}
      label={status.label}
      activity={run.activity}
      error={run.status === "failed" ? run.error : null}
      open={open}
      onOpenChange={setChosen}
      steps={detail.data && runSteps(detail.data.events, run.status === "running")}
      stepsLoading={detail.isPending}
      stepsError={detail.error}
      onRetrySteps={() => void detail.refetch()}
      onTranscript={() => onTranscript(run.id)}
      onStop={
        active
          ? () =>
              cancel.mutate(run.id, {
                onError: (error) =>
                  toast.error(actionErrorMessage(error, "We couldn’t stop this run. Try again.")),
              })
          : undefined
      }
      stopping={cancel.isPending}
      request={
        request && (
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
        )
      }
    />
  );
  if (kind === "reply") return work;
  return (
    <AgentRunPendingReply name={run.agent.name} tone={status.tone} label={status.label}>
      {work}
    </AgentRunPendingReply>
  );
}
