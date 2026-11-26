import { queryKeys } from "../keys";
import type { QueryTarget } from "../targets";

export type AgentWorkEffect =
  /** An answer: a server write, so server and local agent work change. */
  | { kind: "agent-work" }
  /** A local action or routine edit changes only this desktop's local work. */
  | { kind: "local" };

/** The queries an agent-work mutation can change. */
export function agentWorkInvalidations(
  userId: string,
  organizationId: string,
  effect: AgentWorkEffect,
): QueryTarget[] {
  if (effect.kind === "local")
    return [{ queryKey: queryKeys.agentWorkLocal(userId, organizationId) }];
  return [{ queryKey: queryKeys.agentWork(userId, organizationId) }];
}
