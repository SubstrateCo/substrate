import type { ProposalAction } from "@startup-os/contracts/agent-work";

import type { QueryKey } from "@tanstack/react-query";

import { queryKeys } from "../keys";

export type AgentWorkEffect =
  /** An answer or decline: a server write, so server and local agent work change. */
  | { kind: "agent-work" }
  /** A local action changes only this desktop's local work. The server hears later, by hint. */
  | { kind: "local" }
  /** A routine edit changes the routine list and the agent's activity on this desktop. */
  | { kind: "routines" }
  /** An approved proposal also writes the record it proposed. */
  | { kind: "approved"; action: ProposalAction | null };

/** The queries an agent-work mutation can change, including the records an approval writes. */
export function agentWorkInvalidations(
  userId: string,
  organizationId: string,
  effect: AgentWorkEffect,
): QueryKey[] {
  if (effect.kind === "routines" || effect.kind === "local")
    return [queryKeys.agentWorkLocal(userId, organizationId)];
  const keys: QueryKey[] = [queryKeys.agentWork(userId, organizationId)];
  if (effect.kind !== "approved") return keys;
  const context = queryKeys.context(organizationId);
  const action = effect.action;
  if (!action || action.type === "reply_elsewhere") {
    const conversationId = action?.input.conversationId;
    keys.push(
      queryKeys.conversations(organizationId),
      conversationId
        ? queryKeys.messages(organizationId, conversationId).slice(0, -1)
        : [...queryKeys.messaging(organizationId), "messages"],
      [...context, "message-pages", ...(conversationId ? [conversationId] : [])],
      queryKeys.messageTargets(organizationId, conversationId),
    );
  }
  if (!action || action.type !== "reply_elsewhere")
    keys.push(
      queryKeys.tasks(organizationId),
      [...context, "activity"],
      [...context, "related"],
      [...context, "message-pages"],
    );
  return keys;
}
