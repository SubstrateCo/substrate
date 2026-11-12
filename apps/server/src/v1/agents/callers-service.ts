import type {
  agentCallerInput,
  listCallersInput,
  saveCallerPolicyInput,
} from "@substrate/contracts/agents";
import * as work from "@substrate/database/agent-work";
import type { Database } from "@substrate/database/trusted";

import type { WorkspaceScope } from "../../shared/scope";
import { serviceResult } from "../../shared/service-result";
import type { CommittedPublisher } from "../realtime/committed";
import type { z } from "zod";

/** Who may call an agent. Only the agent's owner reads or changes it. */
export function createCallerService({
  db,
  publish,
}: {
  db: Database;
  publish: CommittedPublisher;
}) {
  return {
    savePolicy(this: void, scope: WorkspaceScope, input: z.output<typeof saveCallerPolicyInput>) {
      return serviceResult(async () =>
        publish(await work.saveCallerPolicy(db, scope, input.agentId, input.policy)),
      );
    },
    listCallers(this: void, scope: WorkspaceScope, input: z.output<typeof listCallersInput>) {
      return serviceResult(() => scope.repositories.agentWork.listCallers(input.agentId));
    },
    allowCaller(this: void, scope: WorkspaceScope, input: z.output<typeof agentCallerInput>) {
      return serviceResult(async () =>
        publish(await work.allowCaller(db, scope, input.agentId, input.callerActorId)),
      );
    },
    removeCaller(this: void, scope: WorkspaceScope, input: z.output<typeof agentCallerInput>) {
      return serviceResult(async () =>
        publish(await work.removeCaller(db, scope, input.agentId, input.callerActorId)),
      );
    },
  };
}
export type CallerService = ReturnType<typeof createCallerService>;
