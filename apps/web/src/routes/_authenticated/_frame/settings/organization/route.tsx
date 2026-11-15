import { organizationSettingsAccess } from "@substrate/contracts/auth/settings-access";

import { createFileRoute, redirect } from "@tanstack/react-router";

import { requireActiveOrganization } from "@/lib/organizations/route-access";

export const Route = createFileRoute("/_authenticated/_frame/settings/organization")({
  // The workspace frame already observes the viewer's role, so this reads the cache. The
  // server still checks the role on every settings request.
  beforeLoad: async ({ context }) => {
    const { organizationId, organization } = await requireActiveOrganization(
      context.queryClient,
      context.session.session.activeOrganizationId,
    );
    const access = organizationSettingsAccess(organization.role);
    if (!access.allowed) throw redirect({ to: "/dashboard" });
    return { organizationSettings: { organizationId, isOwner: access.isOwner } };
  },
});
