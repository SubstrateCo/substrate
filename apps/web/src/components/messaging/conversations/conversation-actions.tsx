import { useQuery } from "@tanstack/react-query";

import { useState } from "react";

import { ConversationActionsMenu } from "./actions/conversation-actions-menu";
import { DeleteConversationDialog } from "./actions/delete-conversation-dialog";
import { LeaveConversationDialog } from "./actions/leave-conversation-dialog";
import { OwnerDialog } from "./actions/owner-dialog";
import { conversationName, type Conversation } from "@/lib/messaging/conversations";
import { useConversationManagement } from "@/queries/messaging/management";
import { deleteImpactQueryOptions } from "@/queries/messaging/options";
import { toast } from "sonner";

type Dialog = "leave" | "transfer" | "delete";

export function ConversationActions({
  organizationId,
  conversation,
  userId,
  onRemoved,
}: {
  organizationId: string;
  conversation: Conversation;
  userId?: string;
  onRemoved: () => Promise<void> | void;
}) {
  const [dialog, setDialog] = useState<Dialog>();
  const { remove, leave, transfer } = useConversationManagement(organizationId, onRemoved);
  const impact = useQuery({
    ...deleteImpactQueryOptions(organizationId, conversation.id),
    enabled: dialog === "delete",
  });
  const name = conversationName(conversation);
  const owner = !!userId && conversation.createdBy === userId;
  const others = (conversation.members ?? []).filter((person) => person.userId !== userId);
  const member =
    !!userId && (conversation.members ?? []).some((person) => person.userId === userId);
  const canLeave =
    conversation.kind !== "dm" && !conversation.left && (member || !conversation.private);
  const close = () => setDialog(undefined);

  return (
    <>
      <ConversationActionsMenu
        onLeave={canLeave ? () => setDialog("leave") : undefined}
        onTransfer={conversation.canManage ? () => setDialog("transfer") : undefined}
        onDelete={conversation.canManage ? () => setDialog("delete") : undefined}
      />
      {dialog === "leave" && owner && others.length > 0 && (
        <OwnerDialog
          mode="leave"
          name={name}
          candidates={others}
          pending={leave.isPending}
          error={leave.error}
          onClose={close}
          onConfirm={(newOwnerUserId) =>
            leave.mutate(
              { conversationId: conversation.id, newOwnerUserId },
              { onSuccess: () => toast.success(`You left ${name}`) },
            )
          }
        />
      )}
      {dialog === "leave" && !(owner && others.length > 0) && (
        <LeaveConversationDialog
          name={name}
          publicChannel={conversation.kind === "channel" && !conversation.private}
          lastMember={owner}
          pending={leave.isPending}
          error={leave.error}
          onClose={close}
          onConfirm={() =>
            leave.mutate(
              { conversationId: conversation.id },
              { onSuccess: () => toast.success(`You left ${name}`) },
            )
          }
        />
      )}
      {dialog === "transfer" && (
        <OwnerDialog
          mode="transfer"
          name={name}
          candidates={(conversation.members ?? []).filter(
            (person) => person.userId !== conversation.createdBy,
          )}
          pending={transfer.isPending}
          error={transfer.error}
          onClose={close}
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
          linkedWork={impact.data?.linkedWork}
          pending={remove.isPending}
          error={remove.error ?? impact.error}
          onClose={close}
          onConfirm={() =>
            remove.mutate(conversation.id, { onSuccess: () => toast.success(`${name} deleted`) })
          }
        />
      )}
    </>
  );
}
