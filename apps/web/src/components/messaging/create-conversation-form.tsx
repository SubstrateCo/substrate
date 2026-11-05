import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CreateConversationForm as CreateConversationFormView,
  type ConversationDraft,
} from "@startup-os/ui/messaging/create-conversation-form";
import { parseRecipientEmails, type Conversation } from "@/lib/messaging";
import { queryKeys } from "@/queries/keys";
import { createConversation } from "@/server/messaging";

export function CreateConversationForm({
  organizationId,
  kind,
  onCreated,
  onClose,
}: {
  organizationId: string;
  kind: Conversation["kind"];
  onCreated: (id: string) => void;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const create = useMutation({
    mutationFn: async ({ name, emails, isPrivate }: ConversationDraft) => {
      const recipients = parseRecipientEmails(emails);
      if (kind !== "channel" && !recipients.length)
        throw new Error("Enter at least one recipient email address.");
      if (kind === "dm" && recipients.length !== 1)
        throw new Error("Use a group message for more than one recipient.");
      if (kind === "group" && recipients.length < 2)
        throw new Error("Enter at least two recipients for a group message.");
      if (kind === "channel" && !name.trim()) throw new Error("Enter a channel name.");
      return createConversation({
        data: {
          organizationId,
          kind,
          name: name.trim() || undefined,
          private: kind !== "channel" || isPrivate,
          emails: recipients,
        },
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.conversations(organizationId) });
    },
  });
  return (
    <CreateConversationFormView
      kind={kind}
      pending={create.isPending}
      error={create.error}
      onClose={onClose}
      onSubmit={(draft) =>
        create.mutate(draft, { onSuccess: (conversation) => onCreated(conversation.id) })
      }
    />
  );
}
