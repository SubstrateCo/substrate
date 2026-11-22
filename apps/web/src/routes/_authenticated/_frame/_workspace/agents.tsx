import { createFileRoute } from "@tanstack/react-router";

import { agentPageSections } from "@/components/agent-work/app/agent-sections";
import { AgentsWorkspace } from "@/components/agent-work/app/agents-workspace";
import { z } from "zod";

export const Route = createFileRoute("/_authenticated/_frame/_workspace/agents")({
  component: AgentsRoute,
  validateSearch: z.object({
    agentId: z.uuid().optional(),
    turnId: z.uuid().optional(),
    messageId: z.uuid().optional(),
    section: z.enum(agentPageSections).optional(),
  }),
});

function AgentsRoute() {
  const { organizationId, session } = Route.useRouteContext();
  const { agentId, turnId, messageId, section } = Route.useSearch();
  return (
    <AgentsWorkspace
      key={organizationId}
      userId={session.user.id}
      organizationId={organizationId}
      agentId={agentId}
      turnId={turnId}
      messageId={messageId}
      section={section ?? "messages"}
    />
  );
}
