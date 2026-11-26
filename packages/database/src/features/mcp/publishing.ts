import type { McpInput, McpOutput } from "@substrate/contracts/agent-tools/tools";
import { askRequestPayload } from "@substrate/contracts/agent-work";
import { realtimeKeys } from "@substrate/contracts/realtime";

import type { RepositoryContext } from "../../core/repository-context";
import type { SessionIdentity } from "../../core/session/identity";
import { ValidationError } from "../../errors";
import { createAsyncRequest } from "../agent-work/requests/async-requests";
import { replyTarget, type ServerTurn } from "./turn";
import { agentWrites } from "./writes";

type Agent = Parameters<typeof agentWrites>[2];

/** reply: the only way an agent publishes to its owner or asks them a question. */
export function publishingTools(
  ctx: RepositoryContext,
  identity: SessionIdentity,
  agent: Agent & { userAgentId: string },
  turn: ServerTurn,
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
    async reply(input: McpInput<"reply">): Promise<McpOutput<"reply">> {
      // Checked before the message posts, so a rejected ask publishes nothing.
      if (input.ask && turn.kind === "unattended")
        throw new ValidationError("Background work cannot ask your owner. Reply without ask.");
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
      ctx.effects.hint({ audience: realtimeKeys.user(identity.userId), domain: "agent-work" });
      return {
        messageId: message.id,
        conversationId: message.conversationId,
        threadId: message.threadId,
        questionId,
        createdAt: message.createdAt.toISOString(),
      };
    },
  };
}
