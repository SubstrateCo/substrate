import type { InteractionWrite } from "@substrate/contracts/context/interactions";

import type { WorkspaceScope } from "../../shared/scope";
import { serviceResult } from "../../shared/service-result";
import type { CommittedPublisher } from "../realtime/committed";

export function createContactInteractionsService(deps: { publish: CommittedPublisher }) {
  return {
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
