import type { AppId, UserAppId } from "@substrate/contracts/apps";
import { canShareInvitation } from "@substrate/contracts/auth/roles";
import { organizationSettingsAccess } from "@substrate/contracts/auth/settings-access";
import { desktopHandoffURL } from "@substrate/contracts/desktop/links";

import type { CommittedPublisher } from "../../shared/committed";
import type { SettingsScope, WorkspaceScope } from "../../shared/scope-types";
import { ServiceError, serviceResult } from "../../shared/service-result";

export function createOrganizationService(deps: { apiURL: string; publish: CommittedPublisher }) {
  return {
    apps(scope: WorkspaceScope) {
      return serviceResult(() => scope.repositories.organizations.apps());
    },
    updateApps(scope: WorkspaceScope, apps: AppId[]) {
      return serviceResult(async () =>
        deps.publish(await scope.repositories.organizations.updateApps(apps)),
      );
    },
    updateUserApp(scope: WorkspaceScope, input: { appId: UserAppId; enabled: boolean }) {
      return serviceResult(async () =>
        deps.publish(
          await scope.repositories.organizations.updateUserApp({
            appId: input.appId,
            enabled: input.enabled,
          }),
        ),
      );
    },
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
    /** The link that the invitation email carries, so people who may invite can share it. */
    invitationLink(scope: WorkspaceScope, invitationId: string) {
      return serviceResult(async () => {
        const invitation = await scope.repositories.organizations.pendingInvitation(invitationId);
        if (!canShareInvitation(invitation.viewerRole, invitation.role))
          throw new ServiceError("NOT_FOUND", "Invitation not found.");
        // The handoff page opens the desktop app and also offers the browser.
        const path = `/accept-invitation/${encodeURIComponent(invitation.id)}`;
        return { url: desktopHandoffURL(path, deps.apiURL) };
      });
    },
  };
}
export type OrganizationService = ReturnType<typeof createOrganizationService>;
