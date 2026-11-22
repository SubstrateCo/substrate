import type { WorkspaceScope } from "../../shared/scope-types";
import { serviceResult } from "../../shared/service-result";

export function createCrmManagementService() {
  return {
    people: (scope: WorkspaceScope) => serviceResult(() => scope.repositories.crm.people()),
    grants: (scope: WorkspaceScope, entityId: string) =>
      serviceResult(() => scope.repositories.crm.grants(entityId)),
  };
}
