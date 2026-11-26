import {
  requestMachine,
  responseMatchesPayload,
  type AgentRequestResponse,
} from "@substrate/contracts/agent-work";
import { realtimeKeys } from "@substrate/contracts/realtime";

import { effectsFor } from "../../../core/effects";
import type { DatabaseExecutor } from "../../../core/executor";
import type { SessionIdentity } from "../../../core/session/identity";
import { workspaceContext } from "../../../core/session/workspace";
import { AccessDeniedError, ConflictError, ValidationError } from "../../../errors";
import { wakeForRequest } from "../wakes/wakes";
import { answerableBy, ownedRequests } from "./request-views";
import { agentRequests } from "./requests.schema";
import { and, eq, inArray, sql } from "drizzle-orm";

const closed = "This request was already answered or has closed.";

async function requireOwnedRequest(
  db: DatabaseExecutor,
  identity: SessionIdentity,
  requestId: string,
  kinds: ("permission" | "question")[],
) {
  const [request] = await db
    .select()
    .from(agentRequests)
    .where(
      and(
        eq(agentRequests.id, requestId),
        ownedRequests(identity),
        inArray(agentRequests.kind, kinds),
      ),
    );
  if (!request) throw new AccessDeniedError();
  return request;
}

/**
 * Records the owner's answer to a permission or question. The first answer wins: the update
 * applies only while the request is still pending. A blocking answer waits for the home desktop
 * to deliver it; an async answer wakes the agent in the request's session.
 */
export async function respondToRequestInTransaction(
  tx: DatabaseExecutor,
  identity: SessionIdentity,
  requestId: string,
  response: AgentRequestResponse,
) {
  await workspaceContext(tx, identity);
  const request = await requireOwnedRequest(tx, identity, requestId, ["permission", "question"]);
  if (!responseMatchesPayload(request.payload, response))
    throw new ValidationError("Choose one of the offered answers.");
  const [resolved] = await tx
    .update(agentRequests)
    .set({
      status: requestMachine.events.answer.to,
      response,
      resolvedAt: sql`now()`,
      resolvedByUserId: identity.userId,
    })
    .where(and(eq(agentRequests.id, requestId), answerableBy("answer")))
    .returning();
  if (!resolved) throw new ConflictError(closed);
  if (resolved.mode === "async") await wakeForRequest(tx, resolved);
  effectsFor(tx).hint({ audience: realtimeKeys.user(identity.userId), domain: "agent-work" });
  return { status: resolved.status };
}
