import { createFileRoute } from "@tanstack/react-router";

import { OrganizationSelection } from "@/components/organizations/selection/organization-selection";
import { NonWorkspaceLayout } from "@/components/theme/non-workspace-layout";
import { safeRedirect } from "@/lib/auth/navigation";
import { z } from "zod";

export const Route = createFileRoute("/_authenticated/onboarding")({
  validateSearch: z.object({
    redirect: z
      .string()
      .optional()
      .transform((value) => safeRedirect(value, "/setup/complete")),
  }),
  component: Onboarding,
});

function Onboarding() {
  return (
    <NonWorkspaceLayout>
      <OrganizationSelection destination={Route.useSearch().redirect} />
    </NonWorkspaceLayout>
  );
}
