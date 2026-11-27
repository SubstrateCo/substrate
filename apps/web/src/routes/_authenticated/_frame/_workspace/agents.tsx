import { createFileRoute } from "@tanstack/react-router";

import { AgentsWorkspace } from "@/components/agent-work/app/agents-workspace";
import { agentSettingsPages, agentViews } from "@/lib/agent-work/agent-sections";
import { z } from "zod";

export const Route = createFileRoute("/_authenticated/_frame/_workspace/agents")({
  component: AgentsRoute,
  validateSearch: z.object({
    agentId: z.uuid().optional(),
    turnId: z.uuid().optional(),
    messageId: z.uuid().optional(),
    view: z.enum(agentViews).optional(),
    settings: z.enum(agentSettingsPages).optional(),
  }),
});

function AgentsRoute() {
  const { agentId, turnId, messageId, view, settings } = Route.useSearch();
  return (
    <AgentsWorkspace
      agentId={agentId}
      turnId={turnId}
      messageId={messageId}
      view={view ?? "messages"}
      settings={settings}
    />
  );
}
