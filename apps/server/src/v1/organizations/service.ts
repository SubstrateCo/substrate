import type { AppId } from "@substrate/contracts/apps";
import { roles, type OrganizationRole } from "@substrate/contracts/auth/permissions";
import { organizationSettingsAccess } from "@substrate/contracts/auth/settings-access";
import { desktopHandoffURL } from "@substrate/contracts/desktop/links";

import type { SettingsScope, WorkspaceScope } from "../../shared/scope";
import { ServiceError, serviceResult } from "../../shared/service-result";

function storedRoles(role: string | null) {
  return (role ?? "").split(",").map((value) => value.trim());
}

function isRole(role: string): role is OrganizationRole {
  return Object.hasOwn(roles, role);
}

/** Who may share an invitation's link: the people who could send it, as Better Auth decides. */
function canShareInvitation(viewerRole: string, invitationRole: string | null) {
  const viewer = storedRoles(viewerRole);
  const canInvite = viewer.some(
    (role) => isRole(role) && roles[role].authorize({ invitation: ["create"] }).success,
  );
  // Only owners see or hand out owner invitations.
  return canInvite && (viewer.includes("owner") || !storedRoles(invitationRole).includes("owner"));
}

export function createOrganizationService(deps: { apiURL: string }) {
  return {
    apps(scope: WorkspaceScope) {
      return serviceResult(() => scope.repositories.organizations.apps());
    },
    updateApps(scope: WorkspaceScope, apps: AppId[]) {
      return serviceResult(
        async () => (await scope.repositories.organizations.updateApps(apps)).result,
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
