import { proposalActionHash, type ProposalAction } from "@substrate/contracts/agent-work";
import type { TurnContext } from "@substrate/contracts/harness/mcp";
import { mcpTools, type ServerToolName } from "@substrate/contracts/harness/tools";
import { realtimeKeys } from "@substrate/contracts/realtime";

import type { RepositoryContext } from "../../core/repository-context";
import type { SessionIdentity } from "../../core/session/identity";
import { createAsyncRequest } from "../agent-work/requests/async-requests";
import { checkProposalAccess } from "../agent-work/requests/proposals";
import { turnPlace } from "./turn";

/** What a tool call that waits for the owner returns to the agent. */
export const approvalPendingMessage =
  "This call waits for your owner's approval. Do not retry it or work around it. Your owner approves or declines exactly this call, and the result arrives as a new item in a later turn.";

/**
 * Stores a tool call as a proposal for the owner, instead of running it. The call must be one
 * the agent could run now, on records it can read. Returns the proposal's request ID. The
 * caller has checked the turn, so the card shows in the turn's own place.
 */
export async function proposeToolCall(
  ctx: RepositoryContext,
  identity: SessionIdentity,
  agent: { entityId: string; userAgentId: string },
  turn: TurnContext,
  action: { tool: ServerToolName; input: ProposalAction["input"] },
) {
  const targetBasis = await checkProposalAccess(ctx, identity, action);
  const place = turnPlace(turn);
  const proposalId = await createAsyncRequest(ctx.db, {
    organizationId: identity.organizationId,
    userAgentId: agent.userAgentId,
    ownerUserId: identity.userId,
    agentActorEntityId: agent.entityId,
    sessionKey: turn.sessionKey,
    turnId: turn.turnId,
    place: {
      conversationId: place?.conversationId ?? null,
      threadId: place?.threadId ?? null,
      anchorMessageId: null,
    },
    request: {
      kind: "proposal",
      summary: mcpTools[action.tool].title,
      action,
      actionHash: await proposalActionHash(action),
      targetBasis,
    },
  });
  ctx.effects.hint({ audience: realtimeKeys.user(identity.userId), domain: "agent-work" });
  return proposalId;
}
