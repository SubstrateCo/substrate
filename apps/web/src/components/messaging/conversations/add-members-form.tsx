import { useMutation, useQueryClient } from "@tanstack/react-query";

import { addMembers } from "@/api/messaging/requests";
import { AddMembersForm as AddMembersFormView } from "@/components/messaging/conversations/add-members-form-view";
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
  const add = useMutation({
    mutationFn: ({ emails, shareHistory }: { emails: string[]; shareHistory: boolean }) =>
      addMembers({ data: { organizationId, conversationId, emails, shareHistory } }),
    onSuccess: () => invalidateAddedMembers(queryClient, organizationId, conversationId),
  });
  return (
    <AddMembersFormView
      pending={add.isPending}
      error={add.error}
      onClose={onClose}
      onSubmit={(emails, shareHistory) =>
        add.mutate({ emails, shareHistory }, { onSuccess: () => onClose() })
      }
    />
  );
}
