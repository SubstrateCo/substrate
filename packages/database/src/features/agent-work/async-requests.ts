import type {
  AgentRequestPayload,
  ProposalAction,
  ProposalTargetBasis,
} from "@substrate/contracts/agent-work";

import type { DatabaseExecutor } from "../../core/executor";
import type { Place } from "./place";
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
  request:
    | { kind: "question"; payload: AgentRequestPayload }
    | {
        kind: "proposal";
        summary: string;
        action: ProposalAction;
        actionHash: string;
        targetBasis: ProposalTargetBasis;
      };
}

/**
 * Opens a request that does not hold the turn: reply.ask or propose. The turn ends, and the
 * owner's answer or decision wakes the agent in the same session.
 */
export async function createAsyncRequest(db: DatabaseExecutor, input: AsyncRequestInput) {
  const { request, place, ...scope } = input;
  const [created] = await db
    .insert(agentRequests)
    .values({
      ...scope,
      ...place,
      mode: "async",
      ...(request.kind === "question"
        ? { kind: "question", payload: request.payload }
        : {
            kind: "proposal",
            payload: { type: "proposal", summary: request.summary },
            proposedAction: request.action,
            actionHash: request.actionHash,
            targetBasis: request.targetBasis,
          }),
    })
    .returning({ id: agentRequests.id });
  return created!.id;
}
