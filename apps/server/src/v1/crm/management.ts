import type { CrmLink } from "@substrate/contracts/crm/links";

import type { CommittedPublisher } from "../../shared/committed";
import type { WorkspaceScope } from "../../shared/scope-types";
import { serviceResult } from "../../shared/service-result";

export function createCrmManagementService(deps: { publish: CommittedPublisher }) {
  return {
    people: (scope: WorkspaceScope) => serviceResult(() => scope.repositories.crm.people()),
    grants: (scope: WorkspaceScope, entityId: string) =>
      serviceResult(() => scope.repositories.crm.grants(entityId)),
    recordLinks: (scope: WorkspaceScope, entityId: string) =>
      serviceResult(() => scope.repositories.crm.recordLinks(entityId)),
    changeRecordLink: (scope: WorkspaceScope, input: CrmLink, remove: boolean) =>
      serviceResult(async () =>
        deps.publish(
          await scope.repositories.crm.changeRecordLink(
            input.entityId,
            input.otherEntityId,
            remove,
          ),
        ),
      ),
  };
}
