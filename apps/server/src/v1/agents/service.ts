import type {
  saveAgentTriggersInput,
  saveAgentInput,
  deleteAgentInput,
  setAgentAvatarInput,
} from "@substrate/contracts/agents";

import type { CommittedPublisher } from "../../shared/committed";
import type { UserScope } from "../../shared/scope-types";
import { serviceResult } from "../../shared/service-result";
import type { z } from "zod";

export function createAgentService({ publish }: { publish: CommittedPublisher }) {
  return {
    listAgents(this: void, scope: UserScope) {
      return serviceResult(() => scope.owner.agents.list());
    },
    saveAgent(this: void, scope: UserScope, input: z.output<typeof saveAgentInput>) {
      return serviceResult(async () => publish(await scope.owner.agents.saveAgent(input)));
    },
    setAgentAvatar(this: void, scope: UserScope, input: z.output<typeof setAgentAvatarInput>) {
      return serviceResult(async () =>
        publish(await scope.owner.agents.setAvatar(input.id, input.avatar)),
      );
    },
    deleteAgent(this: void, scope: UserScope, input: z.output<typeof deleteAgentInput>) {
      return serviceResult(async () => publish(await scope.owner.agents.deleteAgent(input.id)));
    },
    saveAgentTriggers(
      this: void,
      scope: UserScope,
      input: z.output<typeof saveAgentTriggersInput>,
    ) {
      return serviceResult(async () => publish(await scope.owner.agents.saveTriggers(input)));
    },
    setAgentHomeDevice(this: void, scope: UserScope, input: z.output<typeof deleteAgentInput>) {
      return serviceResult(async () => publish(await scope.owner.agents.setHomeDevice(input.id)));
    },
  };
}
export type AgentService = ReturnType<typeof createAgentService>;
