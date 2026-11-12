import { organizationSettingsAccess } from "@substrate/contracts/auth/settings-access";

import type { SettingsScope, WorkspaceScope } from "../../shared/scope";
import { serviceResult } from "../../shared/service-result";

export function createOrganizationService() {
  return {
    settingsAccess({ session, role }: SettingsScope) {
      return serviceResult(async () => {
        const organizationId = session?.session.activeOrganizationId;
        if (!organizationId || role === null) return null;
        const access = organizationSettingsAccess(role);
        return access.allowed ? { organizationId, isOwner: access.isOwner } : null;
      });
    },
    current(scope: WorkspaceScope) {
      return serviceResult(() => scope.repositories.organizations.summary());
    },
    people(scope: WorkspaceScope) {
      return serviceResult(() => scope.repositories.organizations.people());
    },
  };
}
export type OrganizationService = ReturnType<typeof createOrganizationService>;
