import { createFileRoute, redirect } from "@tanstack/react-router";

import { isAccessFailure } from "@/components/feedback/request-failure";
import { SetupCompleteScreen } from "@/components/onboarding/setup-complete-screen";
import { isDesktop } from "@/lib/desktop/auth";
import {
  activeMemberQueryOptions,
  organizationQueryOptions,
} from "@/queries/organizations/options";
import { z } from "zod";

export const Route = createFileRoute("/_authenticated/_standalone/setup/complete")({
  validateSearch: z.object({ conversationId: z.uuid().optional() }),
  beforeLoad: async ({ context }) => {
    if (isDesktop()) throw redirect({ to: "/dashboard" });
    const organizationId = context.session.session.activeOrganizationId;
    if (!organizationId) throw redirect({ to: "/onboarding" });
    try {
      const [organization, membership] = await Promise.all([
        context.queryClient.query(organizationQueryOptions(organizationId)),
        context.queryClient.query(activeMemberQueryOptions(organizationId)),
      ]);
      return {
        organizationId,
        name: organization.name,
        canInvite: membership.role.split(",").includes("owner"),
      };
    } catch (error) {
      if (error instanceof Error && isAccessFailure(error)) throw redirect({ to: "/onboarding" });
      throw error;
    }
  },
  component: SetupComplete,
});

function SetupComplete() {
  const { organizationId, name, canInvite } = Route.useRouteContext();
  return (
    <SetupCompleteScreen
      organizationId={organizationId}
      name={name}
      canInvite={canInvite}
      conversationId={Route.useSearch().conversationId}
    />
  );
}
