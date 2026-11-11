import type {
  saveAgentTriggersInput,
  saveAgentInput,
  deleteAgentInput,
  setAgentPictureInput,
} from "@substrate/contracts/agents";

import type { UserScope } from "../../shared/scope";
import { serviceResult } from "../../shared/service-result";
import type { CommittedPublisher } from "../realtime/committed";
import type { z } from "zod";

export function createAgentService({ publish }: { publish: CommittedPublisher }) {
  return {
    listAgents(this: void, scope: UserScope) {
      return serviceResult(() => scope.owner.agents.list());
    },
    saveAgent(this: void, scope: UserScope, input: z.output<typeof saveAgentInput>) {
      return serviceResult(async () => publish(await scope.owner.agents.saveAgent(input)));
    },
    setAgentPicture(this: void, scope: UserScope, input: z.output<typeof setAgentPictureInput>) {
      return serviceResult(async () =>
        publish(await scope.owner.agents.setPicture(input.id, input.fileId)),
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
