import type { AgentRunView } from "@startup-os/contracts/agent-runs";

import { useState } from "react";

import { AgentRunCard as AgentRunCardView } from "./agent-run-card-view";
import { AgentRunTranscript } from "./agent-run-transcript";
import { AgentRunRequest } from "./requests/agent-run-request";
import { ApiError } from "@/api/result";
import { actionErrorMessage } from "@/components/feedback/action-error-message";
import { useAgentRunActions } from "@/queries/agent-runs/options";
import { toast } from "sonner";

export function AgentRunCard({
  userId,
  organizationId,
  run,
}: {
  userId: string;
  organizationId: string;
  run: AgentRunView;
}) {
  const [transcript, setTranscript] = useState(false);
  const { cancel, respond } = useAgentRunActions(userId, organizationId);
  const active = run.status === "queued" || run.status === "running";
  // Show the open request, or how the latest one ended while the run continues.
  const request =
    run.requests.find((item) => item.status === "pending") ??
    (active ? run.requests.at(-1) : undefined);
  return (
    <>
      <AgentRunCardView
        run={run}
        cancelling={cancel.isPending}
        onCancel={() =>
          cancel.mutate(run.id, {
            onError: (error) =>
              toast.error(actionErrorMessage(error, "We couldn’t cancel this run. Try again.")),
          })
        }
        onTranscript={() => setTranscript(true)}
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
      {transcript && (
        <AgentRunTranscript
          userId={userId}
          organizationId={organizationId}
          runId={run.id}
          name={run.agent.name}
          onClose={() => setTranscript(false)}
        />
      )}
    </>
  );
}
