import { useQuery } from "@tanstack/react-query";

import { useRef, useState } from "react";

import { ConversationActionsMenu } from "./actions/conversation-actions-menu";
import { DeleteConversationDialog } from "./actions/delete-conversation-dialog";
import { LeaveConversationDialog } from "./actions/leave-conversation-dialog";
import { OwnerDialog } from "./actions/owner-dialog";
import { ConversationAgents } from "./conversation-agents";
import { SharingManager } from "@/components/messaging/sharing/sharing-manager";
import {
  conversationLabel,
  conversationName,
  humanMembers,
  type Conversation,
} from "@/lib/messaging/conversations";
import { useConversationManagement } from "@/queries/messaging/management";
import { deleteImpactQueryOptions } from "@/queries/messaging/options";
import { toast } from "sonner";

type Dialog = "agents" | "leave" | "transfer" | "delete" | "sharing";

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
  // Running text: a public channel reads "#name", as in the composer and search.
  const name = conversationLabel({ ...conversation, name: conversationName(conversation) });
  const owner = !!userId && conversation.createdBy === userId && !!conversation.canManage;
  const people = humanMembers(conversation.members);
  const others = people.filter((person) => person.userId !== userId);
  const canLeave = conversation.kind !== "dm" && !!conversation.joined;
  const leaveLabel = conversation.kind === "channel" ? "Leave channel" : "Leave group";
  const deleteLabel = conversation.kind === "channel" ? "Delete channel" : "Delete group";
  const publicChannel = conversation.kind === "channel" && !conversation.private;
  const close = () => setDialog(undefined);
  // The dialogs are mounted by state, so none has a trigger of its own. A menu item is gone once
  // the menu closes; give focus back to the actions button instead. When the conversation is gone
  // too, the sidebar is the nearest place left.
  const trigger = useRef<HTMLButtonElement>(null);
  const restoreFocus = () => {
    if (trigger.current?.isConnected) trigger.current.focus();
    else document.querySelector<HTMLElement>("#conversation-sidebar button")?.focus();
  };

  return (
    <>
      <ConversationActionsMenu
        triggerRef={trigger}
        leaveLabel={leaveLabel}
        deleteLabel={deleteLabel}
        onSharing={conversation.canShare ? () => setDialog("sharing") : undefined}
        onAgents={canLeave && userId ? () => setDialog("agents") : undefined}
        onLeave={canLeave ? () => setDialog("leave") : undefined}
        onTransfer={conversation.canManage ? () => setDialog("transfer") : undefined}
        onDelete={conversation.canManage ? () => setDialog("delete") : undefined}
      />
      {dialog === "sharing" && (
        <SharingManager
          organizationId={organizationId}
          conversationId={conversation.id}
          onClose={close}
          onRestoreFocus={restoreFocus}
        />
      )}
      {dialog === "agents" && userId && (
        <ConversationAgents
          userId={userId}
          organizationId={organizationId}
          conversationId={conversation.id}
          members={conversation.members}
          name={name}
          onClose={close}
          onRestoreFocus={restoreFocus}
        />
      )}
      {dialog === "leave" && owner && others.length > 0 && (
        <OwnerDialog
          mode="leave"
          name={name}
          leaveLabel={leaveLabel}
          publicChannel={publicChannel}
          candidates={others}
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
      {dialog === "leave" && !(owner && others.length > 0) && (
        <LeaveConversationDialog
          name={name}
          leaveLabel={leaveLabel}
          publicChannel={publicChannel}
          lastMember={owner}
          pending={leave.isPending}
          error={leave.error}
          onClose={close}
          onRestoreFocus={restoreFocus}
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
          candidates={people.filter((person) => person.userId !== conversation.createdBy)}
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
