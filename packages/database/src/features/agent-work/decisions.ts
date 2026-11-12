import {
  proposalAction,
  proposalActionHash,
  requestMachine,
  responseMatchesPayload,
  type AgentRequestResponse,
  type ProposalOutcome,
} from "@substrate/contracts/agent-work";
import { realtimeKeys } from "@substrate/contracts/realtime";

import type { DatabaseExecutor } from "../../client";
import { effectsFor } from "../../core/effects";
import type { SessionIdentity } from "../../core/session/identity";
import { workspaceContext } from "../../core/session/workspace";
import { AccessDeniedError, ConflictError, ValidationError } from "../../errors";
import { inStates } from "./machine-sql";
import { runProposalAction } from "./proposals";
import { answerableBy, answerableRequest, ownedRequests } from "./request-views";
import { agentRequests } from "./requests.schema";
import { wakeForRequest } from "./wakes";
import { and, eq, inArray, sql } from "drizzle-orm";

const closed = "This request was already answered or has closed.";

async function requireOwnedRequest(
  db: DatabaseExecutor,
  identity: SessionIdentity,
  requestId: string,
  kinds: ("permission" | "question" | "proposal")[],
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
export function respondToRequest(
  db: DatabaseExecutor,
  identity: SessionIdentity,
  requestId: string,
  response: AgentRequestResponse,
) {
  return db.transaction((tx) => respondToRequestInTransaction(tx, identity, requestId, response));
}

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
    .where(and(eq(agentRequests.id, requestId), answerableRequest))
    .returning();
  if (!resolved) throw new ConflictError(closed);
  if (resolved.mode === "async") await wakeForRequest(tx, resolved, "answer");
  effectsFor(tx).hint({ audience: realtimeKeys.user(identity.userId), domain: "agent-work" });
  return { status: resolved.status };
}

/** Declines a proposal. Nothing runs; the agent learns the decision in its session. */
export function declineProposal(
  db: DatabaseExecutor,
  identity: SessionIdentity,
  requestId: string,
) {
  return db.transaction((tx) => declineProposalInTransaction(tx, identity, requestId));
}

export async function declineProposalInTransaction(
  tx: DatabaseExecutor,
  identity: SessionIdentity,
  requestId: string,
) {
  await workspaceContext(tx, identity);
  await requireOwnedRequest(tx, identity, requestId, ["proposal"]);
  const outcome: ProposalOutcome = { status: "declined" };
  const [resolved] = await tx
    .update(agentRequests)
    .set({
      status: requestMachine.events.decline.to,
      outcome,
      resolvedAt: sql`now()`,
      resolvedByUserId: identity.userId,
    })
    .where(and(eq(agentRequests.id, requestId), answerableBy("decline")))
    .returning();
  if (!resolved) throw new ConflictError(closed);
  await wakeForRequest(tx, resolved, "approval_result");
  effectsFor(tx).hint({ audience: realtimeKeys.user(identity.userId), domain: "agent-work" });
  return { status: resolved.status, outcome };
}

/**
 * Approves a proposal and runs exactly the proposed action as the agent, once. The claim moves
 * the request from pending to executing, so a second approval finds it closed. Access is checked
 * again when the action runs, with its targets locked, and the action runs only while the targets
 * are as they were proposed. A failed action is recorded and reported; it is not retried.
 */
// Only expected failures are recorded, with messages the owner can act on. Others are rethrown.
export function proposalFailure(error: Error): ProposalOutcome | null {
  if (error instanceof AccessDeniedError)
    return { status: "failed", error: "The target no longer exists or is no longer available." };
  if (error instanceof ValidationError || error instanceof ConflictError)
    return { status: "failed", error: error.message };
  return null;
}

export function approveProposal(
  db: DatabaseExecutor,
  identity: SessionIdentity,
  requestId: string,
) {
  return db.transaction((tx) => approveProposalInTransaction(tx, identity, requestId));
}

export async function approveProposalInTransaction(
  tx: DatabaseExecutor,
  identity: SessionIdentity,
  requestId: string,
) {
  await workspaceContext(tx, identity);
  await requireOwnedRequest(tx, identity, requestId, ["proposal"]);
  const [claimed] = await tx
    .update(agentRequests)
    .set({
      status: requestMachine.events.approve.to,
      resolvedAt: sql`now()`,
      resolvedByUserId: identity.userId,
    })
    .where(and(eq(agentRequests.id, requestId), answerableBy("approve")))
    .returning();
  if (!claimed) throw new ConflictError(closed);
  let outcome: ProposalOutcome;
  const parsed = proposalAction.safeParse(claimed.proposedAction);
  if (!parsed.success || (await proposalActionHash(parsed.data)) !== claimed.actionHash)
    outcome = { status: "failed", error: "The proposed action changed after it was proposed." };
  else {
    const agent = {
      organizationId: claimed.organizationId,
      userId: claimed.ownerUserId,
      actorEntityId: claimed.agentActorEntityId,
    };
    try {
      // A savepoint, so a failed action leaves no partial writes but the decision is kept. Its
      // hints join the transaction only if the savepoint succeeds.
      const result = await tx.transaction(async (sp) => {
        const { context, actor } = await workspaceContext(sp, agent, { lockActor: true });
        return runProposalAction(context, agent, actor, {
          id: claimed.id,
          turnId: claimed.turnId,
          action: parsed.data,
          targetBasis: claimed.targetBasis,
        });
      });
      outcome = { status: "executed", receipt: result.receipt };
    } catch (error) {
      const failure = error instanceof Error ? proposalFailure(error) : null;
      if (!failure) throw error;
      outcome = failure;
    }
  }
  const ended = outcome.status === "executed" ? "execute" : "fail";
  const [finished] = await tx
    .update(agentRequests)
    .set({ status: requestMachine.events[ended].to, outcome })
    .where(
      and(
        eq(agentRequests.id, requestId),
        inStates(agentRequests.status, requestMachine.from(ended)),
      ),
    )
    .returning();
  await wakeForRequest(tx, finished!, "approval_result");
  effectsFor(tx).hint({ audience: realtimeKeys.user(identity.userId), domain: "agent-work" });
  return { status: finished!.status, outcome };
}
