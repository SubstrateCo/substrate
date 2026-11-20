import { createFileRoute, redirect } from "@tanstack/react-router";

import { isAccessFailure } from "@/api/access-failure";
import { SetupCompleteScreen } from "@/components/onboarding/setup-complete-screen";
import { isDesktop } from "@/lib/desktop/auth";
import { currentOrganizationQueryOptions } from "@/queries/organizations/options";
import { z } from "zod";

export const Route = createFileRoute("/_authenticated/_standalone/setup/complete")({
  validateSearch: z.object({ conversationId: z.uuid().optional() }),
  beforeLoad: async ({ context }) => {
    if (isDesktop()) throw redirect({ to: "/dashboard" });
    const organizationId = context.session.session.activeOrganizationId;
    if (!organizationId) throw redirect({ to: "/onboarding" });
    try {
      const organization = await context.queryClient.query(
        currentOrganizationQueryOptions(organizationId),
      );
      return { organizationId, name: organization.name, role: organization.role };
    } catch (error) {
      if (error instanceof Error && isAccessFailure(error)) throw redirect({ to: "/onboarding" });
      throw error;
    }
  },
  component: SetupComplete,
});

function SetupComplete() {
  const { organizationId, name, role } = Route.useRouteContext();
  return (
    <SetupCompleteScreen
      organizationId={organizationId}
      name={name}
      role={role}
      conversationId={Route.useSearch().conversationId}
    />
  );
}
