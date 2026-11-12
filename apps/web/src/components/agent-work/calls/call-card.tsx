import type { AgentInvocationView, DecideInvocationInput } from "@substrate/contracts/agent-work";

import { CallCardView } from "./call-card-view";
import { useCallMutations } from "@/queries/agent-work/calls";

export function CallCard({
  userId,
  organizationId,
  call,
}: {
  userId: string;
  organizationId: string;
  call: AgentInvocationView;
}) {
  const { decide } = useCallMutations(userId, organizationId, call.userAgentId);
  return (
    <CallCardView
      call={call}
      pending={decide.isPending}
      error={decide.error}
      onDecide={(decision: DecideInvocationInput["decision"]) =>
        decide.mutate({ invocationId: call.id, decision })
      }
    />
  );
}
