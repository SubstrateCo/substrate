import type { AgentRequestResponse, DecideInvocationInput } from "@substrate/contracts/agent-work";
import type { AgentCallerPolicy } from "@substrate/contracts/agents";

import type { RepositoryContext } from "../../core/repository-context";
import type { SessionIdentity } from "../../core/session/identity";
import {
  allowCallerInTransaction,
  queryCallers,
  removeCallerInTransaction,
  saveCallerPolicyInTransaction,
} from "../agents/callers";
import { queryCallsLog } from "./audit";
import {
  approveProposalInTransaction,
  declineProposalInTransaction,
  respondToRequestInTransaction,
} from "./decisions";
import { decideInvocationInTransaction, invocationViews, queryMyCalls } from "./invocations";
import { agentInvocations } from "./invocations.schema";
import { queryConversationRequests, queryNeedsYou } from "./request-views";
import { statusViews } from "./status";
import { eq } from "drizzle-orm";

export function createAgentWorkReadRepository(
  context: RepositoryContext,
  identity: SessionIdentity,
) {
  const { db } = context;
  return {
    listConversationRequests: (conversationId: string) =>
      queryConversationRequests(db, identity, conversationId),
    listNeedsYou: () => queryNeedsYou(db, identity),
    listStatus: () => statusViews(db, identity),
    listInvocations: (userAgentId?: string) =>
      invocationViews(
        db,
        identity,
        userAgentId ? eq(agentInvocations.userAgentId, userAgentId) : undefined,
      ),
    listMyCalls: (conversationId: string) => queryMyCalls(db, identity, conversationId),
    listCallsLog: (userAgentId: string) => queryCallsLog(db, identity, userAgentId),
    listCallers: (userAgentId: string) => queryCallers(db, identity, userAgentId),
    respondToRequest: (requestId: string, response: AgentRequestResponse) =>
      respondToRequestInTransaction(db, identity, requestId, response),
    approveProposal: (requestId: string) => approveProposalInTransaction(db, identity, requestId),
    declineProposal: (requestId: string) => declineProposalInTransaction(db, identity, requestId),
    decideInvocation: (invocationId: string, decision: DecideInvocationInput["decision"]) =>
      decideInvocationInTransaction(db, identity, invocationId, decision),
    saveCallerPolicy: (userAgentId: string, policy: AgentCallerPolicy) =>
      saveCallerPolicyInTransaction(db, identity, userAgentId, policy),
    allowCaller: (userAgentId: string, callerActorId: string) =>
      allowCallerInTransaction(db, identity, userAgentId, callerActorId),
    removeCaller: (userAgentId: string, callerActorId: string) =>
      removeCallerInTransaction(db, identity, userAgentId, callerActorId),
  };
}
