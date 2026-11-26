import { canLeave, isOwner, ownerCandidates } from "@substrate/contracts/messaging/permissions";

import { useQuery } from "@tanstack/react-query";

import { ConversationActionsMenu } from "./actions/conversation-actions-menu";
import { DeleteConversationDialog } from "./actions/delete-conversation-dialog";
import { LeaveConversationDialog } from "./actions/leave-conversation-dialog";
import { OwnerDialog } from "./actions/owner-dialog";
import { focusConversationSidebar } from "./conversation-sidebar-focus";
import { useStateDialog } from "@/components/feedback/use-state-dialog";
import { SharingManager } from "@/components/messaging/sharing/sharing-manager";
import { useWorkspaceScope } from "@/components/workspace/workspace-scope-context";
import {
  conversationTextLabel,
  humanMembers,
  type Conversation,
} from "@/lib/messaging/conversations";
import { useConversationManagement } from "@/queries/messaging/management";
import { deleteImpactQueryOptions } from "@/queries/messaging/options";
import { toast } from "sonner";

type Dialog = "leave" | "transfer" | "delete" | "sharing";

export function ConversationActions({
  conversation,
  onRemoved,
}: {
  conversation: Conversation;
  onRemoved: () => Promise<void> | void;
}) {
  const { organizationId, userId } = useWorkspaceScope();
  // A dialog opened from the menu returns focus to its trigger. When the conversation is gone
  // too, the sidebar is the nearest place left.
  const {
    value: dialog,
    open,
    close,
    restoreFocus,
  } = useStateDialog<Dialog>(focusConversationSidebar);
  const { remove, leave, transfer } = useConversationManagement(organizationId, onRemoved);
  const impact = useQuery({
    ...deleteImpactQueryOptions(organizationId, conversation.id),
    enabled: dialog === "delete",
  });
  // Running text: a public channel reads "#name", as in the composer and search.
  const name = conversationTextLabel(conversation);
  const candidates = humanMembers(ownerCandidates(conversation));
  const { leaveLabel, deleteLabel } =
    conversation.kind === "channel"
      ? { leaveLabel: "Leave channel", deleteLabel: "Delete channel" }
      : { leaveLabel: "Leave group", deleteLabel: "Delete group" };
  const ownershipActions = conversation.canManage
    ? { onTransfer: () => open("transfer"), onDelete: () => open("delete") }
    : undefined;

  return (
    <>
      <ConversationActionsMenu
        leaveLabel={leaveLabel}
        deleteLabel={deleteLabel}
        onSharing={conversation.canShare ? () => open("sharing") : undefined}
        onLeave={canLeave(conversation) ? () => open("leave") : undefined}
        {...ownershipActions}
      />
      {dialog === "sharing" && (
        <SharingManager
          organizationId={organizationId}
          conversationId={conversation.id}
          name={name}
          onClose={close}
          onRestoreFocus={restoreFocus}
        />
      )}
      {dialog === "leave" && (
        <LeaveConversation
          conversation={conversation}
          userId={userId}
          name={name}
          leaveLabel={leaveLabel}
          candidates={candidates}
          pending={leave.isPending}
          error={leave.error}
          onClose={close}
          onRestoreFocus={restoreFocus}
          onConfirm={(newOwnerUserId) =>
            leave.mutate(
              { conversationId: conversation.id, newOwnerUserId },
              { onSuccess: () => toast.success(`You left ${name}`) },
            )
          }
        />
      )}
      {dialog === "transfer" && (
        <OwnerDialog
          mode="transfer"
          name={name}
          candidates={candidates}
          pending={transfer.isPending}
          error={transfer.error}
          onClose={close}
          onRestoreFocus={restoreFocus}
          onConfirm={(newOwner) =>
            transfer.mutate(
              { conversationId: conversation.id, userId: newOwner },
              {
                onSuccess: () => {
                  toast.success("Owner changed");
                  close();
                },
              },
            )
          }
        />
      )}
      {dialog === "delete" && (
        <DeleteConversationDialog
          name={name}
          deleteLabel={deleteLabel}
          linkedWork={impact.data?.linkedWork}
          pending={remove.isPending}
          error={remove.error ?? impact.error}
          onClose={close}
          onRestoreFocus={restoreFocus}
          onConfirm={() =>
            remove.mutate(conversation.id, { onSuccess: () => toast.success(`${name} deleted`) })
          }
        />
      )}
    </>
  );
}

function LeaveConversation({
  conversation,
  userId,
  name,
  leaveLabel,
  candidates,
  pending,
  error,
  onClose,
  onRestoreFocus,
  onConfirm,
}: {
  conversation: Conversation;
  userId: string;
  name: string;
  leaveLabel: string;
  candidates: ReturnType<typeof humanMembers>;
  pending: boolean;
  error: Error | null;
  onClose: () => void;
  onRestoreFocus: () => void;
  onConfirm: (newOwnerUserId?: string) => void;
}) {
  const owner = isOwner(conversation, userId);
  const publicChannel = conversation.kind === "channel" && !conversation.private;
  const dialogProps = { name, leaveLabel, publicChannel, pending, error, onClose, onRestoreFocus };
  if (owner && candidates.length > 0)
    return (
      <OwnerDialog {...dialogProps} mode="leave" candidates={candidates} onConfirm={onConfirm} />
    );
  return (
    <LeaveConversationDialog {...dialogProps} lastMember={owner} onConfirm={() => onConfirm()} />
  );
}
