import { createFileRoute } from "@tanstack/react-router";

import { OrganizationSelection } from "@/components/organizations/selection/organization-selection";
import { safeRedirect } from "@/lib/auth/navigation";
import { z } from "zod";

export const Route = createFileRoute("/_authenticated/_standalone/onboarding")({
  validateSearch: z.object({
    redirect: z
      .string()
      .optional()
      .transform((value) => safeRedirect(value, "/setup/complete")),
  }),
  component: Onboarding,
});

function Onboarding() {
  return <OrganizationSelection destination={Route.useSearch().redirect} />;
}
