import { createFileRoute } from "@tanstack/react-router";

import { AgentsWorkspace } from "@/components/agent-work/app/agents-workspace";
import { agentPageSections } from "@/lib/agent-work/agent-sections";
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
  const { agentId, turnId, messageId, section } = Route.useSearch();
  return (
    <AgentsWorkspace
      agentId={agentId}
      turnId={turnId}
      messageId={messageId}
      section={section ?? "messages"}
    />
  );
}
