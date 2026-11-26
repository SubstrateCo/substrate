import type { AgentInvocationView, DecideInvocationInput } from "@substrate/contracts/agent-work";

import { CallCardView } from "./call-card-view";
import { useWorkspaceScope } from "@/components/workspace/workspace-scope-context";
import { useCallMutations } from "@/queries/agent-work/calls";

export function CallCard({ call }: { call: AgentInvocationView }) {
  const { userId, organizationId } = useWorkspaceScope();
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
