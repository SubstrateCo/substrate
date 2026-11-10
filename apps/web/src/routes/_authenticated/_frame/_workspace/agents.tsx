import { createFileRoute } from "@tanstack/react-router";

import { AgentsWorkspace } from "@/components/agent-work/app/agents-workspace";
import { z } from "zod";

export const Route = createFileRoute("/_authenticated/_frame/_workspace/agents")({
  component: AgentsRoute,
  validateSearch: z.object({
    agentId: z.uuid().optional(),
    turnId: z.uuid().optional(),
    tab: z.enum(["routines", "settings"]).optional(),
  }),
});

function AgentsRoute() {
  const { organizationId, session } = Route.useRouteContext();
  const { agentId, turnId, tab } = Route.useSearch();
  return (
    <AgentsWorkspace
      key={organizationId}
      userId={session.user.id}
      organizationId={organizationId}
      agentId={agentId}
      turnId={turnId}
      tab={tab}
    />
  );
}
