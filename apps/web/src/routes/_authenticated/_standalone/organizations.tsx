import { createFileRoute } from "@tanstack/react-router";

import { OrganizationSelection } from "@/components/organizations/selection/organization-selection";

export const Route = createFileRoute("/_authenticated/_standalone/organizations")({
  component: OrganizationSelection,
});
