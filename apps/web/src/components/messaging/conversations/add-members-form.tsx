import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { addMembers } from "@/api/messaging/requests";
import { AddMembersForm as AddMembersFormView } from "@/components/messaging/conversations/add-members-form-view";
import { parseRecipientEmails } from "@/lib/messaging/recipients";
import { queryKeys } from "@/queries/keys";
import { messagingAgentsOptions } from "@/queries/messaging/agents";

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
    mutationFn: async ({ emails, agentActorIds }: { emails: string; agentActorIds: string[] }) => {
      const recipients = parseRecipientEmails(emails);
      if (!recipients.length && !agentActorIds.length) throw new Error("Choose a person or agent.");
      return addMembers({
        data: { organizationId, conversationId, emails: recipients, agentActorIds },
      });
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.messaging(organizationId) }),
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
