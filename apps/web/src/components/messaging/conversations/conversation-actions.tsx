import { canLeave, isOwner, ownerCandidates } from "@substrate/contracts/messaging/permissions";
import { conversationLevel } from "@substrate/contracts/notifications/alerts";
import { defaultWorkspaceNotificationPreferences } from "@substrate/contracts/notifications/preferences";

import { useQuery } from "@tanstack/react-query";

import { useState } from "react";

import {
  ConversationActionsMenu,
  type ConversationNotificationMenu,
} from "./actions/conversation-actions-menu";
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
import { muteState, muteUntil } from "@/lib/notifications/mute";
import { useConversationManagement } from "@/queries/messaging/management";
import { deleteImpactQueryOptions } from "@/queries/messaging/options";
import {
  conversationNotificationPreferencesOptions,
  useUpdateConversationNotificationPreferences,
  workspaceNotificationPreferencesOptions,
} from "@/queries/notifications/preferences";
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
  const name = conversationTextLabel(conversation);
  const candidates = humanMembers(ownerCandidates(conversation));
  const { leaveLabel, deleteLabel } =
    conversation.kind === "channel"
      ? { leaveLabel: "Leave channel", deleteLabel: "Delete channel" }
      : { leaveLabel: "Leave group", deleteLabel: "Delete group" };
  const ownershipActions = conversation.canManage
    ? { onTransfer: () => open("transfer"), onDelete: () => open("delete") }
    : undefined;

  const [wantedFor, setWantedFor] = useState<string>();
  const notifications = useConversationNotifications(conversation, wantedFor === conversation.id);

  return (
    <>
      <ConversationActionsMenu
        leaveLabel={leaveLabel}
        deleteLabel={deleteLabel}
        notifications={notifications}
        onIntent={() => setWantedFor(conversation.id)}
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

const settingError = () => toast.error("We couldn’t change this setting. Try again.");

function useConversationNotifications(
  conversation: Conversation,
  load: boolean,
): ConversationNotificationMenu | undefined {
  const { organizationId, userId } = useWorkspaceScope();
  const member = conversation.joined;
  const own = useQuery({
    ...conversationNotificationPreferencesOptions(userId, organizationId, conversation.id),
    enabled: member && load,
  });
  const workspace = useQuery({
    ...workspaceNotificationPreferencesOptions(userId, organizationId),
    enabled: member && load && conversation.kind === "channel",
  });
  const update = useUpdateConversationNotificationPreferences(
    userId,
    organizationId,
    conversation.id,
  );
  if (!member) return undefined;
  const channels = workspace.data?.channels ?? defaultWorkspaceNotificationPreferences.channels;
  return {
    defaultLevel: conversationLevel(conversation.kind, null, channels),
    level: own.data?.level,
    mute: own.data ? muteState(own.data.mutedUntil) : undefined,
    pending: update.isPending,
    onLevel: (level) => update.mutate({ level }, { onError: settingError }),
    onMute: (choice) => update.mutate({ mutedUntil: muteUntil(choice) }, { onError: settingError }),
  };
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
