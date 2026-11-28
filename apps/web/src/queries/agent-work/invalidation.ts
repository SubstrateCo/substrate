import type { ProposalAction } from "@substrate/contracts/agent-work";

import { queryKeys } from "../keys";
import { domainTargets, type QueryTarget } from "../targets";
import { z } from "zod";

export type AgentWorkEffect =
  | { kind: "agent-work" }
  | { kind: "approved"; action: ProposalAction | null };

export function agentWorkInvalidations(
  userId: string,
  organizationId: string,
  effect: AgentWorkEffect,
): QueryTarget[] {
  const targets: QueryTarget[] = [{ queryKey: queryKeys.agentWork(userId, organizationId) }];
  if (effect.kind !== "approved") return targets;
  const action = effect.action;
  if (!action || action.tool === "reply")
    targets.push(
      ...domainTargets("messaging", organizationId, action ? replyConversation(action) : undefined),
    );
  if (!action || action.tool !== "reply")
    targets.push(
      ...domainTargets("tasks", organizationId),
      ...domainTargets("context", organizationId),
    );
  return targets;
}

const replyPlace = z.object({ to: z.object({ conversationId: z.uuid() }) });

function replyConversation(action: ProposalAction) {
  const parsed = replyPlace.safeParse(action.input);
  return parsed.success ? parsed.data.to.conversationId : undefined;
}
