import { useMutation, useQueryClient } from "@tanstack/react-query";

import { createConversation } from "@/api/messaging/requests";
import {
  CreateConversationDialog as CreateConversationDialogView,
  type ConversationDraft,
} from "@/components/messaging/conversations/create-conversation-dialog-view";
import type { Conversation } from "@/lib/messaging/conversations";
import { recipientEmails, type PickerPerson } from "@/lib/people/people-picker";
import { queryKeys } from "@/queries/keys";

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
  const queryClient = useQueryClient();
  const create = useMutation({
    mutationFn: ({ name, recipients, isPrivate, shareHistory }: ConversationDraft) =>
      createConversation({
        data: {
          organizationId,
          kind,
          name: name.trim() || undefined,
          private: kind !== "channel" || isPrivate,
          emails: recipientEmails(recipients),
          shareHistory,
        },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.conversations(organizationId) });
    },
  });
  return (
    <CreateConversationDialogView
      kind={kind}
      people={people}
      onClose={onClose}
      onRestoreFocus={onRestoreFocus}
      pending={create.isPending}
      error={create.error}
      onSubmit={(draft) =>
        create.mutate(draft, { onSuccess: (conversation) => onCreated(conversation.id) })
      }
    />
  );
}
