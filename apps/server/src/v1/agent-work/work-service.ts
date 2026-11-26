import type {
  agentActivityInput,
  ownerCreateRoutineInput,
  ownerUpdateRoutineInput,
} from "@substrate/contracts/agent-work";

import type { CommittedPublisher } from "../../shared/committed";
import type { WorkspaceScope } from "../../shared/scope-types";
import { serviceResult } from "../../shared/service-result";
import type { z } from "zod";

type Repository = WorkspaceScope["repositories"]["agentWork"];
type TurnCommand = "stopTurn" | "retryTurn" | "dismissTurn" | "startFresh";
type ItemCommand = "sendNow" | "resendItem" | "discardItem";

/**
 * The owner's agent work from any device: activity, conversation work, turns and routines, and
 * the commands that change them. Each command publishes a data-less agent-work hint to the
 * owner, which also tells the agent's home host to sync.
 */
export function createWorkService({ publish }: { publish: CommittedPublisher }) {
  const repository = (scope: WorkspaceScope): Repository => scope.repositories.agentWork;
  return {
    activity(
      this: void,
      scope: WorkspaceScope,
      agentId: string,
      input: z.output<typeof agentActivityInput>,
    ) {
      return serviceResult(() => repository(scope).agentActivity(agentId, input.cursor));
    },
    conversationWork(this: void, scope: WorkspaceScope, conversationId: string) {
      return serviceResult(() => repository(scope).conversationWork(conversationId));
    },
    turn(this: void, scope: WorkspaceScope, turnId: string) {
      return serviceResult(() => repository(scope).turn(turnId));
    },
    turnCommand(this: void, scope: WorkspaceScope, command: TurnCommand, turnId: string) {
      return serviceResult(async () => publish(await repository(scope)[command](turnId)));
    },
    itemCommand(this: void, scope: WorkspaceScope, command: ItemCommand, itemId: string) {
      return serviceResult(async () => publish(await repository(scope)[command](itemId)));
    },
    newTopic(this: void, scope: WorkspaceScope, conversationId: string) {
      return serviceResult(async () => publish(await repository(scope).newTopic(conversationId)));
    },
    listRoutines(this: void, scope: WorkspaceScope, agentId: string) {
      return serviceResult(() => repository(scope).listRoutines(agentId));
    },
    createRoutine(
      this: void,
      scope: WorkspaceScope,
      input: z.output<typeof ownerCreateRoutineInput>,
    ) {
      const { organizationId: _, agentId, ...routine } = input;
      return serviceResult(async () =>
        publish(await repository(scope).createRoutine(agentId, routine)),
      );
    },
    updateRoutine(
      this: void,
      scope: WorkspaceScope,
      routineId: string,
      input: z.output<typeof ownerUpdateRoutineInput>,
    ) {
      return serviceResult(async () =>
        publish(await repository(scope).updateRoutine(routineId, input.changes)),
      );
    },
    deleteRoutine(this: void, scope: WorkspaceScope, routineId: string) {
      return serviceResult(async () => publish(await repository(scope).deleteRoutine(routineId)));
    },
    approveRoutine(this: void, scope: WorkspaceScope, routineId: string, revision: number) {
      return serviceResult(async () =>
        publish(await repository(scope).approveRoutine(routineId, revision)),
      );
    },
  };
}
export type WorkService = ReturnType<typeof createWorkService>;
