import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";

import { AgentMembersDialog } from "./actions/agent-members-dialog";
import { useWorkspaceScope } from "@/components/workspace/workspace-scope-context";
import { conversationAgentOptions, type ConversationMember } from "@/lib/messaging/conversations";
import { agentCatalogQueryOptions } from "@/queries/agents/catalog";
import { useConversationAgents } from "@/queries/messaging/agents";
import { toast } from "sonner";

export function ConversationAgents({
  conversationId,
  members,
  name,
  onClose,
  onRestoreFocus,
}: {
  conversationId: string;
  members: readonly ConversationMember[];
  name: string;
  onClose: () => void;
  onRestoreFocus?: () => void;
}) {
  const { organizationId, userId } = useWorkspaceScope();
  const catalog = useQuery(agentCatalogQueryOptions(userId));
  const navigate = useNavigate();
  // The server sets agentId only for the viewer's own agents, so other people's agents stay out.
  const ownAgents = members.flatMap((member) =>
    member.type === "agent" && member.agentId
      ? [{ id: member.actorId, title: member.name, image: member.image, agentId: member.agentId }]
      : [],
  );
  const { add, remove } = useConversationAgents(organizationId, conversationId);
  const agents = conversationAgentOptions(catalog.data?.agents ?? [], ownAgents);
  const removingId = remove.isPending
    ? agents.find((agent) => agent.actorId === remove.variables)?.agentId
    : undefined;
  const busyId = add.isPending ? add.variables : removingId;
  return (
    <AgentMembersDialog
      name={name}
      agents={agents}
      loading={catalog.isPending}
      error={add.error ?? remove.error ?? catalog.error}
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
      onOpenAgents={() => void navigate({ to: "/agents", search: { workspaceId: organizationId } })}
      onClose={onClose}
      onRestoreFocus={onRestoreFocus}
    />
  );
}
