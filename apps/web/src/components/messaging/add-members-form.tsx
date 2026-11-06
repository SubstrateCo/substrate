import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AddMembersForm as AddMembersFormView } from "@/ui/messaging/add-members-form";
import { parseRecipientEmails } from "@/lib/messaging";
import { queryKeys } from "@/queries/keys";
import { addMembers } from "@/api/messaging";

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
    mutationFn: async (emails: string) => {
      const recipients = parseRecipientEmails(emails);
      if (!recipients.length) throw new Error("Enter at least one email address.");
      return addMembers({ data: { organizationId, conversationId, emails: recipients } });
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.messaging(organizationId) }),
  });
  return (
    <AddMembersFormView
      pending={add.isPending}
      error={add.error}
      onClose={onClose}
      onSubmit={(emails) => add.mutate(emails, { onSuccess: () => onClose() })}
    />
  );
}
