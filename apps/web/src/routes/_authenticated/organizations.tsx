import { createFileRoute } from "@tanstack/react-router";

import { OrganizationSelection } from "@/components/organizations/selection/organization-selection";
import { NonWorkspaceLayout } from "@/components/theme/non-workspace-layout";

export const Route = createFileRoute("/_authenticated/organizations")({
  component: Organizations,
});

function Organizations() {
  return (
    <NonWorkspaceLayout>
      <OrganizationSelection />
    </NonWorkspaceLayout>
  );
}
