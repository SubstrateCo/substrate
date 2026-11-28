import { membersButtonSelector, type HeaderMember } from "./conversation-header";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { RowAction, RowActions } from "@/components/layout/row-actions";
import { useWorkspaceScope } from "@/components/workspace/workspace-scope-context";
import { useConversationAgents } from "@/queries/messaging/agents";
import { useRemoveMember } from "@/queries/messaging/message-mutations";
import { UserMinus } from "lucide-react";

export function RemoveMemberAction({
  member,
  onRemove,
}: {
  member: HeaderMember;
  onRemove: () => void;
}) {
  return (
    <RowActions label={`Actions for ${member.name}`}>
      <RowAction destructive label={`Remove ${member.name}`} onClick={onRemove}>
        <UserMinus aria-hidden="true" />
      </RowAction>
    </RowActions>
  );
}

const removalCopy = {
  person:
    "They and their agents will lose access through this organization. Access through another connected organization is unchanged. Their past messages and linked work will remain.",
  publicChannel:
    "This ends their membership. This channel is public: they can still read its history, post, and rejoin.",
  agent:
    "This agent stops reading and replying here. Its earlier messages stay, and you can add it back later.",
};

export function RemoveMemberDialog({
  conversationId,
  member,
  publicChannel,
  onClose,
}: {
  conversationId: string;
  member: HeaderMember;
  publicChannel: boolean;
  onClose: () => void;
}) {
  const { organizationId } = useWorkspaceScope();
  const remove = useRemoveMember(organizationId, conversationId, member.actorId);
  const agents = useConversationAgents(organizationId, conversationId);
  const removal =
    member.type === "agent"
      ? {
          mutation: agents.remove,
          description: removalCopy.agent,
          confirm: () => agents.remove.mutate(member.actorId, { onSuccess: onClose }),
        }
      : {
          mutation: remove,
          description: publicChannel ? removalCopy.publicChannel : removalCopy.person,
          confirm: () => remove.mutate(undefined, { onSuccess: onClose }),
        };
  return (
    <ConfirmDialog
      destructive
      title={`Remove ${member.name}?`}
      description={removal.description}
      confirmLabel="Remove member"
      pending={removal.mutation.isPending}
      error={removal.mutation.error}
      errorDescription="This member couldn’t be removed. Try again."
      onConfirm={removal.confirm}
      onClose={onClose}
      onRestoreFocus={() => {
        document.querySelector<HTMLElement>(membersButtonSelector)?.focus();
      }}
    />
  );
}
