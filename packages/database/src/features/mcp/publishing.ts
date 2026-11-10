import { askRequestPayload, proposalActionHash } from "@startup-os/contracts/agent-work";
import type { TurnContext } from "@startup-os/contracts/harness/mcp";
import type { McpInput, McpOutput } from "@startup-os/contracts/harness/tools";
import type { RealtimeHint } from "@startup-os/contracts/realtime";

import type { RepositoryContext } from "../../core/repository-context";
import { ValidationError } from "../../errors";
import { createAsyncRequest } from "../agent-work/async-requests";
import type { MessagingIdentity } from "../messaging/access";
import { checkProposalAccess } from "./proposals";
import { replyTarget, turnPlace } from "./turn";
import { agentWrites } from "./writes";

type Agent = Parameters<typeof agentWrites>[2];

/** reply and propose: the only ways an agent publishes to its owner or asks for approval. */
export function publishingTools(
  ctx: RepositoryContext,
  identity: MessagingIdentity,
  agent: Agent & { userAgentId: string },
  turn: TurnContext,
) {
  const scope = {
    organizationId: identity.organizationId,
    userAgentId: agent.userAgentId,
    ownerUserId: identity.userId,
    agentActorEntityId: agent.entityId,
    sessionKey: turn.sessionKey,
    turnId: turn.turnId,
  };
  return {
    async reply(input: McpInput<"reply">): Promise<McpOutput<"reply"> & { hints: RealtimeHint[] }> {
      // Checked before the message posts, so a rejected ask publishes nothing.
      if (input.ask && turn.kind === "unattended")
        throw new ValidationError(
          "Background work cannot ask your owner. Reply without ask, or use propose.",
        );
      const target = replyTarget(turn, input.to);
      const message = await agentWrites(ctx, identity, agent).postMessage({
        conversationId: target.conversationId,
        threadId: target.threadId ?? undefined,
        body: input.body,
        requestId: input.requestId,
        originTurnId: turn.turnId,
      });
      const questionId = input.ask
        ? await createAsyncRequest(ctx.db, {
            ...scope,
            place: {
              conversationId: message.conversationId,
              threadId: message.threadId,
              anchorMessageId: message.id,
            },
            request: { kind: "question", payload: askRequestPayload(input.ask) },
          })
        : null;
      return {
        messageId: message.id,
        conversationId: message.conversationId,
        threadId: message.threadId,
        questionId,
        createdAt: message.createdAt.toISOString(),
        // Built in the send transaction, so the caller publishes them without reading back.
        hints: message.hints,
      };
    },
    async propose(input: McpInput<"propose">): Promise<McpOutput<"propose">> {
      const targetBasis = await checkProposalAccess(ctx, identity, input.action);
      // requireTurn already checked that the owner can see the turn's places.
      const place = turnPlace(turn);
      const proposalId = await createAsyncRequest(ctx.db, {
        ...scope,
        place: {
          conversationId: place?.conversationId ?? null,
          threadId: place?.threadId ?? null,
          anchorMessageId: null,
        },
        request: {
          kind: "proposal",
          summary: input.summary,
          action: input.action,
          actionHash: await proposalActionHash(input.action),
          targetBasis,
        },
      });
      return { proposalId, status: "pending" };
    },
  };
}
