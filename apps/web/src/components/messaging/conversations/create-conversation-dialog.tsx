import { useQuery } from "@tanstack/react-query";

import { CreateConversationDialog as CreateConversationDialogView } from "@/components/messaging/conversations/create-conversation-dialog-view";
import { useWorkspaceScope } from "@/components/workspace/workspace-scope-context";
import type { Conversation } from "@/lib/messaging/conversations";
import { recipientEmails } from "@/lib/people/people-picker";
import { useCreateConversation } from "@/queries/messaging/conversations";
import { workspacePeopleQueryOptions } from "@/queries/organizations/people";

export function CreateConversationDialog({
  kind,
  onCreated,
  onClose,
  onRestoreFocus,
}: {
  kind: Conversation["kind"];
  onCreated: (id: string) => void;
  onClose: () => void;
  onRestoreFocus?: () => void;
}) {
  const { organizationId, userId } = useWorkspaceScope();
  const workspacePeople = useQuery(workspacePeopleQueryOptions(organizationId));
  // Until people load, or if they fail to load, the picker suggests nobody and still accepts
  // typed email addresses.
  const people = workspacePeople.isSuccess
    ? workspacePeople.data.filter((person) => person.id !== userId)
    : [];
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
