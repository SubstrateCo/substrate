import type { AgentRequestPayload } from "@substrate/contracts/agent-work";

import type { DatabaseExecutor } from "../../../core/executor";
import type { Place } from "../place";
import { agentRequests } from "./requests.schema";

export interface AsyncRequestInput {
  organizationId: string;
  userAgentId: string;
  ownerUserId: string;
  agentActorEntityId: string;
  sessionKey: string;
  turnId: string;
  /** A place the caller already checked with requirePlace. */
  place: Place;
  request: { kind: "question"; payload: AgentRequestPayload };
}

/**
 * Opens a request that does not hold the turn: reply.ask. The turn ends, and the owner's answer
 * wakes the agent in the same session.
 */
export async function createAsyncRequest(db: DatabaseExecutor, input: AsyncRequestInput) {
  const { request, place, ...scope } = input;
  const [created] = await db
    .insert(agentRequests)
    .values({
      ...scope,
      ...place,
      mode: "async",
      kind: request.kind,
      payload: request.payload,
    })
    .returning({ id: agentRequests.id });
  return created!.id;
}
