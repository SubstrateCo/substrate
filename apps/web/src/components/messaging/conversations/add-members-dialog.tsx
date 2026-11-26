import { canManageOwnAgents } from "@substrate/contracts/messaging/permissions";

import { useQuery } from "@tanstack/react-query";

import { AddMembersDialog as AddMembersDialogView } from "@/components/messaging/conversations/add-members-dialog-view";
import { useWorkspaceScope } from "@/components/workspace/workspace-scope-context";
import { AddMembersError } from "@/lib/messaging/add-members";
import { conversationTextLabel, humanMembers } from "@/lib/messaging/conversations";
import { agentCatalogQueryOptions } from "@/queries/agents/catalog";
import { useAddMembers } from "@/queries/messaging/conversations";
import { conversationsQueryOptions } from "@/queries/messaging/options";
import { workspacePeopleQueryOptions } from "@/queries/organizations/people";

/**
 * Managers add people; members add their own agents. Admins may manage conversations they cannot
 * read: pass the `name` and `memberUserIds` from their managed list to exclude current members.
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
  const { userId } = useWorkspaceScope();
  const canAddPeople = !!conversation?.canManage || memberUserIds !== undefined;
  const canAddAgents = !!conversation && canManageOwnAgents(conversation);
  const catalog = useQuery({ ...agentCatalogQueryOptions(userId), enabled: canAddAgents });
  const memberAgents = new Set(
    conversation?.members.flatMap((member) =>
      member.type === "agent" && member.agentId ? [member.agentId] : [],
    ),
  );
  const agents = (canAddAgents ? (catalog.data?.agents ?? []) : []).filter(
    (agent) => agent.enabled && !memberAgents.has(agent.id),
  );
  const members = new Set([
    ...humanMembers(conversation?.members).map((member) => member.userId),
    ...(memberUserIds ?? []),
  ]);
  const workspacePeople = useQuery({
    ...workspacePeopleQueryOptions(organizationId),
    enabled: canAddPeople,
  });
  const people = (canAddPeople ? (workspacePeople.data ?? []) : []).filter(
    (person) => !members.has(person.id),
  );
  const add = useAddMembers(organizationId, conversationId);
  return (
    <AddMembersDialogView
      name={name ?? (conversation && conversationTextLabel(conversation))}
      channel={conversation?.kind === "channel"}
      people={people}
      agents={agents}
      allowEmail={canAddPeople}
      pending={add.isPending}
      error={
        add.error ??
        (canAddPeople ? workspacePeople.error : null) ??
        (canAddAgents ? catalog.error : null)
      }
      onClose={onClose}
      onRestoreFocus={onRestoreFocus}
      onSubmit={(recipients, shareHistory, onPartial) =>
        add.mutate(
          { recipients, shareHistory },
          {
            onSuccess: () => onClose(),
            onError: (error) => {
              if (error instanceof AddMembersError) onPartial(error.completed);
            },
          },
        )
      }
    />
  );
}
