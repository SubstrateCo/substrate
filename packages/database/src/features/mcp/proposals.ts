import { mcpTools, type ServerToolName } from "@substrate/contracts/agent-tools/tools";
import { proposalActionHash, type ProposalAction } from "@substrate/contracts/agent-work";
import { realtimeKeys } from "@substrate/contracts/realtime";

import type { RepositoryContext } from "../../core/repository-context";
import type { SessionIdentity } from "../../core/session/identity";
import { createAsyncRequest } from "../agent-work/requests/async-requests";
import { checkProposalAccess } from "../agent-work/requests/proposals";
import { turnPlace, type ServerTurn } from "./turn";

/** What a tool call that waits for the owner returns to the agent. */
export const approvalPendingMessage =
  "This call waits for your owner's approval. Do not retry it or work around it. Your owner approves or declines exactly this call, and the result arrives as a new item in a later turn.";

export async function proposeToolCall(
  ctx: RepositoryContext,
  identity: SessionIdentity,
  agent: { entityId: string; userAgentId: string },
  turn: ServerTurn,
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
