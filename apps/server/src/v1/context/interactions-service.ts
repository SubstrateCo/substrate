import type {
  InteractionPeriod,
  InteractionTimeline,
  InteractionWrite,
  InteractionDirectory,
} from "@substrate/contracts/context/interactions";

import type { CommittedPublisher } from "../../shared/committed";
import type { WorkspaceScope } from "../../shared/scope-types";
import { serviceResult } from "../../shared/service-result";

export function createContactInteractionsService(deps: { publish: CommittedPublisher }) {
  return {
    directory: (scope: WorkspaceScope, input: InteractionDirectory) =>
      serviceResult(() => scope.repositories.contactInteractions.workspaceDirectory(input)),
    record: (scope: WorkspaceScope, id: string) =>
      serviceResult(() => scope.repositories.contactInteractions.workspaceRecord(id)),
    profile: (scope: WorkspaceScope, id: string, type: "person" | "account") =>
      serviceResult(() => scope.repositories.contactInteractions.workspaceProfile(id, type)),
    activity: (scope: WorkspaceScope, input: InteractionPeriod) =>
      serviceResult(() => scope.repositories.contactInteractions.workspaceActivity(input)),
    timeline: (scope: WorkspaceScope, input: InteractionTimeline) =>
      serviceResult(() => scope.repositories.contactInteractions.workspaceTimeline(input)),
    list: (scope: WorkspaceScope, id: string) =>
      serviceResult(() => scope.repositories.contactInteractions.listInteractions(id)),
    mutate: (scope: WorkspaceScope, input: InteractionWrite) =>
      serviceResult(async () =>
        deps.publish(
          await scope.repositories.transaction(async (repos) => {
            switch (input.action) {
              case "publishInteraction":
                return repos.contactInteractions.publishInteraction(input);
              case "createInteraction":
                return repos.contactInteractions.createInteraction({
                  ...input,
                  occurredAt: new Date(input.occurredAt),
                  endedAt: input.endedAt ? new Date(input.endedAt) : null,
                });
              case "updateInteraction":
                return repos.contactInteractions.updateInteraction(input.entityId, input);
              case "deleteInteraction":
                return repos.contactInteractions.deleteInteraction(input.entityId);
            }
          }),
        ),
      ),
  };
}
export type ContactInteractionsService = ReturnType<typeof createContactInteractionsService>;
