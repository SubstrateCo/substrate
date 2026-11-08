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
  onCreated,
  onCancel,
}: {
  organizationId: string;
  kind: Conversation["kind"];
  onCreated: (id: string) => void;
  onCancel: () => void;
}) {
  const queryClient = useQueryClient();
  const create = useMutation({
    mutationFn: async ({ name, emails, isPrivate }: ConversationDraft) => {
      return createConversation({
        data: {
          organizationId,
          kind,
          name: name.trim() || undefined,
          private: kind !== "channel" || isPrivate,
          emails: parseRecipientEmails(emails),
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
      onCancel={onCancel}
      pending={create.isPending}
      error={create.error}
      onSubmit={(draft) =>
        create.mutate(draft, { onSuccess: (conversation) => onCreated(conversation.id) })
      }
    />
  );
}
