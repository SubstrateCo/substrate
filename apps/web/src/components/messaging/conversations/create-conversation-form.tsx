import { useMutation, useQueryClient } from "@tanstack/react-query";

import { createConversation } from "@/api/messaging/requests";
import {
  CreateConversationForm as CreateConversationFormView,
  type ConversationDraft,
} from "@/components/messaging/conversations/create-conversation-form-view";
import type { Conversation } from "@/lib/messaging/conversations";
import { parseRecipientEmails } from "@/lib/messaging/recipients";
import { queryKeys } from "@/queries/keys";

export function CreateConversationForm({
  organizationId,
  kind,
  initialEmails,
  onCreated,
  onCancel,
}: {
  organizationId: string;
  kind: Conversation["kind"];
  initialEmails?: string;
  onCreated: (id: string) => void;
  onCancel: () => void;
}) {
  const queryClient = useQueryClient();
  const create = useMutation({
    mutationFn: async ({ name, emails, isPrivate, shareHistory }: ConversationDraft) => {
      return createConversation({
        data: {
          organizationId,
          kind,
          name: name.trim() || undefined,
          private: kind !== "channel" || isPrivate,
          emails: parseRecipientEmails(emails),
          shareHistory,
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
      initialEmails={initialEmails}
      onCancel={onCancel}
      pending={create.isPending}
      error={create.error}
      onSubmit={(draft) =>
        create.mutate(draft, { onSuccess: (conversation) => onCreated(conversation.id) })
      }
    />
  );
}
