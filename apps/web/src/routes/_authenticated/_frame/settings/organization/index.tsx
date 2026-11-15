import { createFileRoute } from "@tanstack/react-router";

import { OrganizationGeneral } from "@/components/organizations/settings/organization-general";

export const Route = createFileRoute("/_authenticated/_frame/settings/organization/")({
  component: Section,
});

function Section() {
  const { organizationSettings } = Route.useRouteContext();
  return <OrganizationGeneral organizationId={organizationSettings.organizationId} />;
}
