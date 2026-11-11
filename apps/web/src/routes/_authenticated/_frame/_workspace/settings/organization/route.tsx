import { organizationSettingsAccess } from "@substrate/contracts/auth/settings-access";

import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { SettingsShell } from "@/components/settings/settings-shell";
import { activeMemberQueryOptions } from "@/queries/organizations/options";

export const Route = createFileRoute("/_authenticated/_frame/_workspace/settings/organization")({
  component: OrganizationSettingsRoute,
  // The workspace frame already observes the active member role, so this reads the cache. The
  // server still checks the role on every settings request.
  beforeLoad: async ({ context }) => {
    const { organizationId } = context;
    const member = await context.queryClient.query({
      ...activeMemberQueryOptions(organizationId),
      staleTime: Infinity,
    });
    const access = organizationSettingsAccess(member.role);
    if (!access.allowed) throw redirect({ to: "/dashboard" });
    return { organizationSettings: { organizationId, isOwner: access.isOwner } };
  },
});

function OrganizationSettingsRoute() {
  return (
    <SettingsShell>
      <Outlet />
    </SettingsShell>
  );
}
