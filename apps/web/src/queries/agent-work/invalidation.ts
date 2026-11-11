import type { ProposalAction } from "@substrate/contracts/agent-work";

import { queryKeys } from "../keys";
import { domainTargets, type QueryTarget } from "../targets";

export type AgentWorkEffect =
  /** An answer or decline: a server write, so server and local agent work change. */
  | { kind: "agent-work" }
  /** A local action changes only this desktop's local work. The server hears later, by hint. */
  | { kind: "local" }
  /** A routine edit changes the routine list and the agent's activity on this desktop. */
  | { kind: "routines" }
  /** An approved proposal also writes the record it proposed. */
  | { kind: "approved"; action: ProposalAction | null };

/**
 * The queries an agent-work mutation can change. An approval also refreshes what a realtime hint
 * for the records it writes would refresh. Without the action, it may have written either.
 */
export function agentWorkInvalidations(
  userId: string,
  organizationId: string,
  effect: AgentWorkEffect,
): QueryTarget[] {
  if (effect.kind === "routines" || effect.kind === "local")
    return [{ queryKey: queryKeys.agentWorkLocal(userId, organizationId) }];
  const targets: QueryTarget[] = [{ queryKey: queryKeys.agentWork(userId, organizationId) }];
  if (effect.kind !== "approved") return targets;
  const action = effect.action;
  if (!action || action.type === "reply_elsewhere")
    targets.push(...domainTargets("messaging", organizationId, action?.input.conversationId));
  // Proposed work also links its source message.
  if (!action || action.type !== "reply_elsewhere")
    targets.push(
      ...domainTargets("tasks", organizationId),
      ...domainTargets("context", organizationId),
    );
  return targets;
}
