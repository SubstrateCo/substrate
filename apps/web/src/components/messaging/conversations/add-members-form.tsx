import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { addMembers } from "@/api/messaging/requests";
import { AddMembersForm as AddMembersFormView } from "@/components/messaging/conversations/add-members-form-view";
import { messagingAgentsOptions } from "@/queries/messaging/agents";
import { invalidateAddedMembers } from "@/queries/messaging/mutations";

export function AddMembersForm({
  organizationId,
  conversationId,
  onClose,
}: {
  organizationId: string;
  conversationId: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const agents = useQuery(messagingAgentsOptions(organizationId));
  const add = useMutation({
    mutationFn: ({ emails, agentActorIds }: { emails: string[]; agentActorIds: string[] }) =>
      addMembers({ data: { organizationId, conversationId, emails, agentActorIds } }),
    onSuccess: () => invalidateAddedMembers(queryClient, organizationId, conversationId),
  });
  return (
    <AddMembersFormView
      pending={add.isPending}
      error={add.error}
      agents={agents.data ?? []}
      agentsError={agents.error}
      onClose={onClose}
      onSubmit={(emails, agentActorIds) =>
        add.mutate({ emails, agentActorIds }, { onSuccess: () => onClose() })
      }
    />
  );
}
