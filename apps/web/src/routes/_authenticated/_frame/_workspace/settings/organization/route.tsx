import { organizationSettingsAccess } from "@startup-os/contracts/auth/settings-access";

import { createFileRoute, redirect } from "@tanstack/react-router";

import { activeMemberQueryOptions } from "@/queries/organizations/options";

export const Route = createFileRoute("/_authenticated/_frame/_workspace/settings/organization")({
  // The workspace frame already observes the active member role, so this reads the cache. The
  // server still checks the role on every settings request.
  beforeLoad: async ({ context }) => {
    const { organizationId } = context;
    const member = await context.queryClient.query(activeMemberQueryOptions(organizationId));
    const access = organizationSettingsAccess(member.role);
    if (!access.allowed) throw redirect({ to: "/dashboard" });
    return { organizationSettings: { organizationId, isOwner: access.isOwner } };
  },
});
