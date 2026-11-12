import type {
  callsLogInput,
  conversationRequestsInput,
  decideInvocationInput,
  decideProposalInput,
  listInvocationsInput,
  myCallsInput,
  ownerScopeInput,
  respondRequestInput,
} from "@substrate/contracts/agent-work";
import * as work from "@substrate/database/agent-work";
import type { Database } from "@substrate/database/trusted";

import type { WorkspaceScope } from "../../shared/scope";
import { serviceResult } from "../../shared/service-result";
import type { CommittedPublisher } from "../realtime/committed";
import type { z } from "zod";

export function createAgentWorkService({
  db,
  publish,
}: {
  db: Database;
  publish: CommittedPublisher;
}) {
  return {
    listConversationRequests(
      this: void,
      scope: WorkspaceScope,
      input: z.output<typeof conversationRequestsInput>,
    ) {
      return serviceResult(() => work.listConversationRequests(db, scope, input.conversationId));
    },
    listNeedsYou(this: void, scope: WorkspaceScope, _input: z.output<typeof ownerScopeInput>) {
      return serviceResult(() => work.listNeedsYou(db, scope));
    },
    listStatus(this: void, scope: WorkspaceScope, _input: z.output<typeof ownerScopeInput>) {
      return serviceResult(() => work.listStatus(db, scope));
    },
    respondToRequest(
      this: void,
      scope: WorkspaceScope,
      requestId: string,
      input: z.output<typeof respondRequestInput>,
    ) {
      return serviceResult(async () =>
        publish(await work.respondToRequest(db, scope, requestId, input.response)),
      );
    },
    approveProposal(
      this: void,
      scope: WorkspaceScope,
      requestId: string,
      _input: z.output<typeof decideProposalInput>,
    ) {
      return serviceResult(async () => publish(await work.approveProposal(db, scope, requestId)));
    },
    declineProposal(
      this: void,
      scope: WorkspaceScope,
      requestId: string,
      _input: z.output<typeof decideProposalInput>,
    ) {
      return serviceResult(async () => publish(await work.declineProposal(db, scope, requestId)));
    },
    /** The owner's calls of their agents. */
    listInvocations(
      this: void,
      scope: WorkspaceScope,
      input: z.output<typeof listInvocationsInput>,
    ) {
      return serviceResult(() => work.listInvocations(db, scope, input.userAgentId));
    },
    decideInvocation(
      this: void,
      scope: WorkspaceScope,
      invocationId: string,
      input: z.output<typeof decideInvocationInput>,
    ) {
      return serviceResult(async () =>
        publish(await work.decideInvocation(db, scope, invocationId, input.decision)),
      );
    },
    /** The owner's Calls log of one agent. */
    listCallsLog(this: void, scope: WorkspaceScope, input: z.output<typeof callsLogInput>) {
      return serviceResult(() => work.listCallsLog(db, scope, input.userAgentId));
    },
    /** The caller's own call statuses in one conversation. */
    listMyCalls(this: void, scope: WorkspaceScope, input: z.output<typeof myCallsInput>) {
      return serviceResult(() => work.listMyCalls(db, scope, input.conversationId));
    },
  };
}
export type AgentWorkService = ReturnType<typeof createAgentWorkService>;
