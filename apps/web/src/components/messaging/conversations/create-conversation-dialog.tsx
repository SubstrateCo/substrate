import { useQuery } from "@tanstack/react-query";

import { CreateConversationDialog as CreateConversationDialogView } from "@/components/messaging/conversations/create-conversation-dialog-view";
import { useWorkspaceScope } from "@/components/workspace/workspace-scope-context";
import type { Conversation } from "@/lib/messaging/conversations";
import { recipientAgentIds, recipientEmails } from "@/lib/people/people-picker";
import { agentCatalogQueryOptions } from "@/queries/agents/catalog";
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
  const catalog = useQuery(agentCatalogQueryOptions(userId));
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
      agents={(catalog.data?.agents ?? []).filter((agent) => agent.enabled)}
      onClose={onClose}
      onRestoreFocus={onRestoreFocus}
      pending={create.isPending}
      error={create.error ?? catalog.error}
      onSubmit={({ name, recipients, isPrivate, shareHistory }) =>
        create.mutate(
          {
            name: name.trim() || undefined,
            private: isPrivate,
            emails: recipientEmails(recipients),
            agentIds: recipientAgentIds(recipients),
            shareHistory,
          },
          { onSuccess: (conversation) => onCreated(conversation.id) },
        )
      }
    />
  );
}
