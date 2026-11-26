import type { ProposalAction } from "@substrate/contracts/agent-work";

import { queryKeys } from "../keys";
import { domainTargets, type QueryTarget } from "../targets";
import { z } from "zod";

export type AgentWorkEffect =
  /** An answer or decline: a server write, so server and local agent work change. */
  | { kind: "agent-work" }
  /** A local action or routine edit changes only this desktop's local work. */
  | { kind: "local" }
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
  if (effect.kind === "local")
    return [{ queryKey: queryKeys.agentWorkLocal(userId, organizationId) }];
  const targets: QueryTarget[] = [{ queryKey: queryKeys.agentWork(userId, organizationId) }];
  if (effect.kind !== "approved") return targets;
  const action = effect.action;
  // reply is the only server tool that posts a message.
  if (!action || action.tool === "reply")
    targets.push(
      ...domainTargets("messaging", organizationId, action ? replyConversation(action) : undefined),
    );
  // Every other call writes tasks, projects, CRM records or links; the context targets cover the
  // CRM, contacts and interactions. Proposed work also links its source message.
  if (!action || action.tool !== "reply")
    targets.push(
      ...domainTargets("tasks", organizationId),
      ...domainTargets("context", organizationId),
    );
  return targets;
}

const replyPlace = z.object({ to: z.object({ conversationId: z.uuid() }) });

/** The conversation a reply posts in, when it names one. */
function replyConversation(action: ProposalAction) {
  const parsed = replyPlace.safeParse(action.input);
  return parsed.success ? parsed.data.to.conversationId : undefined;
}
