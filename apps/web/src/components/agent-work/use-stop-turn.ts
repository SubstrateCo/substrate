import type { AgentWorkTurnView } from "@substrate/contracts/agent-work";
import { liveTurnStatuses } from "@substrate/contracts/agent-work";

import { actionErrorMessage } from "@/components/feedback/action-error-message";
import { useStop } from "@/queries/agent-work/mutations";
import { toast } from "sonner";

/** The Stop control of one turn. onStop is undefined when the turn can't be stopped. */
export function useStopTurn(userId: string, organizationId: string, turn?: AgentWorkTurnView) {
  const stop = useStop(userId, organizationId);
  const live = !!turn && liveTurnStatuses.includes(turn.status);
  return {
    onStop:
      live && turn.status !== "stopping"
        ? () =>
            stop.mutate(turn.id, {
              onError: (error) =>
                toast.error(actionErrorMessage(error, "We couldn’t stop this work.")),
            })
        : undefined,
    stopping: stop.isPending || turn?.status === "stopping",
  };
}
