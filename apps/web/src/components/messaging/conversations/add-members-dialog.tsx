import { useQuery } from "@tanstack/react-query";

import { AddMembersDialog as AddMembersDialogView } from "@/components/messaging/conversations/add-members-dialog-view";
import { conversationLabel, conversationName, humanMembers } from "@/lib/messaging/conversations";
import { useAddMembers } from "@/queries/messaging/conversations";
import { conversationsQueryOptions } from "@/queries/messaging/options";
import { workspacePeopleQueryOptions } from "@/queries/organizations/people";

/**
 * Adds people to a conversation the viewer manages. Admins may manage conversations they cannot
 * read: pass the `name` and the `memberUserIds` from their managed list, so current members are
 * not suggested.
 */
export function AddMembersDialog({
  organizationId,
  conversationId,
  name,
  memberUserIds,
  onClose,
  onRestoreFocus,
}: {
  organizationId: string;
  conversationId: string;
  /** The conversation as running text, from `conversationLabel`. */
  name?: string;
  /** Current members, when the viewer cannot read the conversation to tell. */
  memberUserIds?: readonly string[];
  onClose: () => void;
  /** Focus the control that opened the dialog, which the dialog cannot find by itself. */
  onRestoreFocus?: () => void;
}) {
  const conversation = useQuery(conversationsQueryOptions(organizationId)).data?.find(
    (row) => row.id === conversationId,
  );
  const members = new Set([
    ...humanMembers(conversation?.members).map((member) => member.userId),
    ...(memberUserIds ?? []),
  ]);
  const people = (useQuery(workspacePeopleQueryOptions(organizationId)).data ?? []).filter(
    (person) => !members.has(person.id),
  );
  const add = useAddMembers(organizationId, conversationId);
  return (
    <AddMembersDialogView
      name={
        name ??
        (conversation &&
          conversationLabel({ ...conversation, name: conversationName(conversation) }))
      }
      channel={conversation?.kind === "channel"}
      people={people}
      pending={add.isPending}
      error={add.error}
      onClose={onClose}
      onRestoreFocus={onRestoreFocus}
      onSubmit={(recipients, shareHistory) =>
        add.mutate({ recipients, shareHistory }, { onSuccess: () => onClose() })
      }
    />
  );
}
