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

import type { CommittedPublisher } from "../../shared/committed";
import type { WorkspaceScope } from "../../shared/scope";
import { serviceResult } from "../../shared/service-result";
import type { z } from "zod";

export function createAgentWorkService({ publish }: { publish: CommittedPublisher }) {
  return {
    listConversationRequests(
      this: void,
      scope: WorkspaceScope,
      input: z.output<typeof conversationRequestsInput>,
    ) {
      return serviceResult(() =>
        scope.repositories.agentWork.listConversationRequests(input.conversationId),
      );
    },
    listNeedsYou(this: void, scope: WorkspaceScope, _input: z.output<typeof ownerScopeInput>) {
      return serviceResult(() => scope.repositories.agentWork.listNeedsYou());
    },
    listStatus(this: void, scope: WorkspaceScope, _input: z.output<typeof ownerScopeInput>) {
      return serviceResult(() => scope.repositories.agentWork.listStatus());
    },
    respondToRequest(
      this: void,
      scope: WorkspaceScope,
      requestId: string,
      input: z.output<typeof respondRequestInput>,
    ) {
      return serviceResult(async () =>
        publish(await scope.repositories.agentWork.respondToRequest(requestId, input.response)),
      );
    },
    approveProposal(
      this: void,
      scope: WorkspaceScope,
      requestId: string,
      _input: z.output<typeof decideProposalInput>,
    ) {
      return serviceResult(async () =>
        publish(await scope.repositories.agentWork.approveProposal(requestId)),
      );
    },
    declineProposal(
      this: void,
      scope: WorkspaceScope,
      requestId: string,
      _input: z.output<typeof decideProposalInput>,
    ) {
      return serviceResult(async () =>
        publish(await scope.repositories.agentWork.declineProposal(requestId)),
      );
    },
    /** The owner's calls of their agents. */
    listInvocations(
      this: void,
      scope: WorkspaceScope,
      input: z.output<typeof listInvocationsInput>,
    ) {
      return serviceResult(() => scope.repositories.agentWork.listInvocations(input.userAgentId));
    },
    decideInvocation(
      this: void,
      scope: WorkspaceScope,
      invocationId: string,
      input: z.output<typeof decideInvocationInput>,
    ) {
      return serviceResult(async () =>
        publish(await scope.repositories.agentWork.decideInvocation(invocationId, input.decision)),
      );
    },
    /** The owner's Calls log of one agent. */
    listCallsLog(this: void, scope: WorkspaceScope, input: z.output<typeof callsLogInput>) {
      return serviceResult(() => scope.repositories.agentWork.listCallsLog(input.userAgentId));
    },
    /** The caller's own call statuses in one conversation. */
    listMyCalls(this: void, scope: WorkspaceScope, input: z.output<typeof myCallsInput>) {
      return serviceResult(() => scope.repositories.agentWork.listMyCalls(input.conversationId));
    },
  };
}
export type AgentWorkService = ReturnType<typeof createAgentWorkService>;
