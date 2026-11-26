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

// Mounted outside the popover: opening the modal can dismiss the member list without
// unmounting its confirmation or losing a pending mutation.
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
  const agent = member.type === "agent";
  const removal = agent ? agents.remove : remove;
  let description =
    "They and their agents will lose access through this organization. Access through another connected organization is unchanged. Their past messages and linked work will remain.";
  if (agent)
    description =
      "This agent stops reading and replying here. Its earlier messages stay, and you can add it back later.";
  else if (publicChannel)
    description =
      "This ends their membership. This channel is public: they can still read its history, post, and rejoin.";
  return (
    <ConfirmDialog
      destructive
      title={`Remove ${member.name}?`}
      description={description}
      confirmLabel="Remove member"
      pending={removal.isPending}
      error={removal.error}
      errorDescription="This member couldn’t be removed. Try again."
      onConfirm={() =>
        agent
          ? agents.remove.mutate(member.actorId, { onSuccess: onClose })
          : remove.mutate(undefined, { onSuccess: onClose })
      }
      onClose={onClose}
      onRestoreFocus={() => {
        document.querySelector<HTMLElement>(membersButtonSelector)?.focus();
      }}
    />
  );
}
