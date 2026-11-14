import type {
  agentCallerInput,
  listCallersInput,
  saveCallerPolicyInput,
} from "@substrate/contracts/agents";

import type { CommittedPublisher } from "../../shared/committed";
import type { WorkspaceScope } from "../../shared/scope";
import { serviceResult } from "../../shared/service-result";
import type { z } from "zod";

/** Who may call an agent. Only the agent's owner reads or changes it. */
export function createCallerService({ publish }: { publish: CommittedPublisher }) {
  return {
    savePolicy(this: void, scope: WorkspaceScope, input: z.output<typeof saveCallerPolicyInput>) {
      return serviceResult(async () =>
        publish(await scope.repositories.agentWork.saveCallerPolicy(input.agentId, input.policy)),
      );
    },
    listCallers(this: void, scope: WorkspaceScope, input: z.output<typeof listCallersInput>) {
      return serviceResult(() => scope.repositories.agentWork.listCallers(input.agentId));
    },
    allowCaller(this: void, scope: WorkspaceScope, input: z.output<typeof agentCallerInput>) {
      return serviceResult(async () =>
        publish(await scope.repositories.agentWork.allowCaller(input.agentId, input.callerActorId)),
      );
    },
    removeCaller(this: void, scope: WorkspaceScope, input: z.output<typeof agentCallerInput>) {
      return serviceResult(async () =>
        publish(
          await scope.repositories.agentWork.removeCaller(input.agentId, input.callerActorId),
        ),
      );
    },
  };
}
export type CallerService = ReturnType<typeof createCallerService>;
