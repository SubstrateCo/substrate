import { createFileRoute, redirect } from "@tanstack/react-router";

import { SetupCompleteScreen } from "@/components/onboarding/setup-complete-screen";
import { isDesktop } from "@/lib/desktop/auth";
import { requireActiveOrganization } from "@/route-guards/organizations";
import { z } from "zod";

export const Route = createFileRoute("/_authenticated/_standalone/setup/complete")({
  validateSearch: z.object({ conversationId: z.uuid().optional() }),
  beforeLoad: async ({ context }) => {
    if (isDesktop()) throw redirect({ to: "/dashboard" });
    const { organizationId, organization } = await requireActiveOrganization(
      context.queryClient,
      context.session.session.activeOrganizationId,
      { redirectTo: "/onboarding", staleTime: undefined },
    );
    return { organizationId, name: organization.name, role: organization.role };
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
