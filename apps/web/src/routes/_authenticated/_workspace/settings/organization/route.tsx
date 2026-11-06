import { createFileRoute, redirect } from "@tanstack/react-router";
import { getOrganizationSettingsAccess } from "@/api/organization-settings";

export const Route = createFileRoute("/_authenticated/_workspace/settings/organization")({
  beforeLoad: async ({ context }) => {
    const access = await getOrganizationSettingsAccess();
    if (!access || access.organizationId !== context.organizationId)
      throw redirect({ to: "/dashboard" });
    return { organizationSettings: access };
  },
});
