import { organizationId } from "../workspace.ts";
import { z } from "zod";

/**
 * Who may call an agent besides its owner. owner: only the owner ("Only me"). anyone: every
 * person in the agent's organization ("Anyone in <org>"). ask: the owner approves each call
 * ("Ask me first"), except for allowlisted callers.
 */
export const agentCallerPolicies = ["owner", "anyone", "ask"] as const;
export type AgentCallerPolicy = (typeof agentCallerPolicies)[number];

const id = z.uuid();

/** POST /agents/actors/callers/policy. Owner only. */
export const saveCallerPolicyInput = z.strictObject({
  organizationId,
  agentId: id,
  policy: z.enum(agentCallerPolicies),
});
export type SaveCallerPolicyInput = z.input<typeof saveCallerPolicyInput>;

/** POST /agents/actors/callers/list. Owner only. */
export const listCallersInput = z.strictObject({ organizationId, agentId: id });

/** POST /agents/actors/callers/allow and /callers/remove. callerActorId is a person's actor. */
export const agentCallerInput = z.strictObject({ organizationId, agentId: id, callerActorId: id });
export type AgentCallerInput = z.input<typeof agentCallerInput>;

/** An allowlisted caller, as the agent's owner sees it. */
export interface AgentCallerView {
  actorId: string;
  name: string;
  createdAt: string;
}

/** The owner's caller settings for one agent in one organization. */
export interface AgentCallers {
  policy: AgentCallerPolicy;
  allowlist: AgentCallerView[];
}
