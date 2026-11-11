import { CreateConversationDialog as CreateConversationDialogView } from "@/components/messaging/conversations/create-conversation-dialog-view";
import type { Conversation } from "@/lib/messaging/conversations";
import { recipientEmails, type PickerPerson } from "@/lib/people/people-picker";
import { useCreateConversation } from "@/queries/messaging/conversations";

export function CreateConversationDialog({
  organizationId,
  kind,
  people,
  onCreated,
  onClose,
  onRestoreFocus,
}: {
  organizationId: string;
  kind: Conversation["kind"];
  people: readonly PickerPerson[];
  onCreated: (id: string) => void;
  onClose: () => void;
  onRestoreFocus?: () => void;
}) {
  const create = useCreateConversation(organizationId, kind);
  return (
    <CreateConversationDialogView
      kind={kind}
      people={people}
      onClose={onClose}
      onRestoreFocus={onRestoreFocus}
      pending={create.isPending}
      error={create.error}
      onSubmit={({ name, recipients, isPrivate, shareHistory }) =>
        create.mutate(
          {
            name: name.trim() || undefined,
            private: isPrivate,
            emails: recipientEmails(recipients),
            shareHistory,
          },
          { onSuccess: (conversation) => onCreated(conversation.id) },
        )
      }
    />
  );
}
