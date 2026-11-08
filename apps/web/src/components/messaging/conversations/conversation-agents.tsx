import { useQuery } from "@tanstack/react-query";

import { AgentMembersDialog } from "./actions/agent-members-dialog";
import { conversationAgentOptions } from "@/lib/messaging/conversations";
import { agentCatalogQueryOptions } from "@/queries/agents/catalog";
import { searchOptions } from "@/queries/context/search";
import { useConversationAgents } from "@/queries/messaging/agents";
import { toast } from "sonner";

export function ConversationAgents({
  userId,
  organizationId,
  conversationId,
  name,
  onClose,
}: {
  userId: string;
  organizationId: string;
  conversationId: string;
  name: string;
  onClose: () => void;
}) {
  const catalog = useQuery(agentCatalogQueryOptions(userId));
  // The server returns only the viewer's own agents that are members of this conversation.
  const members = useQuery(
    searchOptions({ organizationId, conversationId, query: "", kind: "agent", limit: 100 }),
  );
  const { add, remove } = useConversationAgents(organizationId, conversationId);
  const agents = conversationAgentOptions(catalog.data?.agents ?? [], members.data ?? []);
  let busyId: string | undefined;
  if (add.isPending) busyId = add.variables;
  else if (remove.isPending)
    busyId = agents.find((agent) => agent.actorId === remove.variables)?.agentId;
  return (
    <AgentMembersDialog
      name={name}
      agents={agents}
      loading={catalog.isPending || members.isPending}
      error={add.error ?? remove.error ?? catalog.error ?? members.error}
      busyId={busyId}
      onAdd={(agentId) =>
        add.mutate(agentId, {
          onSuccess: () =>
            toast.success(
              `${agents.find((agent) => agent.agentId === agentId)?.name ?? "Agent"} added`,
            ),
        })
      }
      onRemove={(actorId) => remove.mutate(actorId)}
      onClose={onClose}
    />
  );
}
