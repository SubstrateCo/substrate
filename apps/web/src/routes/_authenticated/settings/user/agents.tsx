import { createFileRoute } from "@tanstack/react-router";

import { AgentSettings } from "@/components/agents/agent-settings";

export const Route = createFileRoute("/_authenticated/settings/user/agents")({
  component: AgentsRoute,
});

function AgentsRoute() {
  const { session } = Route.useRouteContext();
  return (
    <AgentSettings userId={session.user.id} organizationId={session.session.activeOrganizationId} />
  );
}
