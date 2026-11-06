import { createFileRoute } from "@tanstack/react-router";

import { OrganizationSelection } from "@/components/organizations/organization-selection";

export const Route = createFileRoute("/_authenticated/organizations")({
  component: OrganizationSelection,
});
