import {
  proposalAction,
  proposalActionHash,
  requestMachine,
  responseMatchesPayload,
  type AgentRequestResponse,
  type ProposalOutcome,
} from "@substrate/contracts/agent-work";
import { realtimeKeys } from "@substrate/contracts/realtime";

import { effectsFor } from "../../../core/effects";
import type { DatabaseExecutor } from "../../../core/executor";
import type { SessionIdentity } from "../../../core/session/identity";
import { workspaceContext } from "../../../core/session/workspace";
import {
  AccessDeniedError,
  AppDisabledError,
  ConflictError,
  ValidationError,
} from "../../../errors";
import { admit } from "../admission/admission";
import { inStates } from "../machine-sql";
import { runProposalAction } from "./proposals";
import { answerableBy, ownedRequests } from "./request-views";
import { agentRequests } from "./requests.schema";
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

export async function respondToRequestInTransaction(
  tx: DatabaseExecutor,
  identity: SessionIdentity,
  requestId: string,
  response: AgentRequestResponse,
) {
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
  if (resolved.mode === "async")
    await admit(tx, [{ type: "request", source: "answer", request: resolved }]);
  effectsFor(tx).hint({ audience: realtimeKeys.user(identity.userId), domain: "agent-work" });
  return { status: resolved.status };
}

export async function declineProposalInTransaction(
  tx: DatabaseExecutor,
  identity: SessionIdentity,
  requestId: string,
) {
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
  await admit(tx, [{ type: "request", source: "approval_result", request: resolved }]);
  effectsFor(tx).hint({ audience: realtimeKeys.user(identity.userId), domain: "agent-work" });
  return { status: resolved.status, outcome };
}

export function proposalFailure(error: Error): ProposalOutcome | null {
  if (error instanceof AccessDeniedError)
    return { status: "failed", error: "The target no longer exists or is no longer available." };
  if (
    error instanceof ValidationError ||
    error instanceof ConflictError ||
    error instanceof AppDisabledError
  )
    return { status: "failed", error: error.message };
  return null;
}

export async function approveProposalInTransaction(
  tx: DatabaseExecutor,
  identity: SessionIdentity,
  requestId: string,
) {
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
      const result = await tx.transaction(async (sp) => {
        const { context, actor, userName } = await workspaceContext(sp, agent);
        return runProposalAction(
          context,
          agent,
          { ...actor, userName },
          {
            id: claimed.id,
            turnId: claimed.turnId,
            action: parsed.data,
            targetBasis: claimed.targetBasis,
          },
        );
      });
      outcome = { status: "executed", receipt: result.receipt, result: result.output };
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
  await admit(tx, [{ type: "request", source: "approval_result", request: finished! }]);
  effectsFor(tx).hint({ audience: realtimeKeys.user(identity.userId), domain: "agent-work" });
  return { status: finished!.status, outcome };
}
