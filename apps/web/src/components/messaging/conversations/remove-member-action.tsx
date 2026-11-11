import type { HeaderMember } from "./conversation-header";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { RowAction, RowActions } from "@/components/layout/row-actions";
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
  organizationId,
  conversationId,
  member,
  publicChannel,
  onClose,
}: {
  organizationId: string;
  conversationId: string;
  member: HeaderMember;
  publicChannel: boolean;
  onClose: () => void;
}) {
  const remove = useRemoveMember(organizationId, conversationId, member.actorId);
  return (
    <ConfirmDialog
      destructive
      title={`Remove ${member.name}?`}
      description={
        publicChannel
          ? "This ends their membership. This channel is public: they can still read its history, post, and rejoin."
          : "They and their agents will lose access through this organization. Access through another connected organization is unchanged. Their past messages and linked work will remain."
      }
      confirmLabel="Remove member"
      pendingLabel="Removing…"
      pending={remove.isPending}
      error={remove.error}
      errorDescription="This member couldn’t be removed. Try again."
      onConfirm={() => remove.mutate(undefined, { onSuccess: onClose })}
      onClose={onClose}
      onRestoreFocus={() => {
        document.querySelector<HTMLElement>('[aria-label^="Members,"]')?.focus();
      }}
    />
  );
}
