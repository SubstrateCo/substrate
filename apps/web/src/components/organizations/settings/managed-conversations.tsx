import { useQuery } from "@tanstack/react-query";

import { useRef } from "react";

import { ManagedConversations as ManagedConversationsView } from "./managed-conversations-view";
import { useStateDialog } from "@/components/feedback/use-state-dialog";
import { SettingsPanel } from "@/components/layout/settings-page";
import { DeleteConversationDialog } from "@/components/messaging/conversations/actions/delete-conversation-dialog";
import { OwnerDialog } from "@/components/messaging/conversations/actions/owner-dialog";
import { AddMembersDialog } from "@/components/messaging/conversations/add-members-dialog";
import { conversationLabel, humanMembers } from "@/lib/messaging/conversations";
import { resourceState } from "@/lib/resource-state";
import { useConversationManagement } from "@/queries/messaging/management";
import {
  deleteImpactQueryOptions,
  managedConversationsQueryOptions,
} from "@/queries/messaging/options";
import { toast } from "sonner";

export function ManagedConversations({ organizationId }: { organizationId: string }) {
  const list = useQuery(managedConversationsQueryOptions(organizationId));
  const fallback = useRef<HTMLDivElement>(null);
  const {
    value: dialog,
    open,
    close,
    restoreFocus,
  } = useStateDialog<{ kind: "transfer" | "delete" | "members"; id: string }>(fallback);
  const { remove, transfer } = useConversationManagement(organizationId);
  const impact = useQuery(
    deleteImpactQueryOptions(organizationId, dialog?.kind === "delete" ? dialog.id : undefined),
  );
  const resource = resourceState(list);
  const target = resource.data?.find((row) => row.id === dialog?.id);
  const name = target
    ? conversationLabel({ ...target, name: target.name ?? "this group message" })
    : "this group message";
  const deleteLabel = target?.kind === "channel" ? "Delete channel" : "Delete group";
  return (
    <SettingsPanel
      title="Conversations"
      description="Every channel and group message in this organization. You see names and members, never messages."
    >
      <div ref={fallback} tabIndex={-1}>
        <ManagedConversationsView
          rows={resource.data}
          state={resource.status}
          loading={list.isPending}
          error={list.error}
          onRetry={() => void list.refetch()}
          onAddMembers={(id) => open({ kind: "members", id })}
          onTransfer={(id) => open({ kind: "transfer", id })}
          onDelete={(id) => open({ kind: "delete", id })}
        />
      </div>
      {dialog?.kind === "members" && target && (
        <AddMembersDialog
          organizationId={organizationId}
          conversationId={target.id}
          name={name}
          memberUserIds={humanMembers(target.members).map((member) => member.userId)}
          onClose={close}
          onRestoreFocus={restoreFocus}
        />
      )}
      {dialog?.kind === "transfer" && target && (
        <OwnerDialog
          mode="transfer"
          name={name}
          candidates={humanMembers(target.members).filter(
            (person) => person.userId !== target.ownerUserId,
          )}
          pending={transfer.isPending}
          error={transfer.error}
          onClose={close}
          onRestoreFocus={restoreFocus}
          onConfirm={(userId) =>
            transfer.mutate(
              { conversationId: target.id, userId },
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
      {dialog?.kind === "delete" && target && (
        <DeleteConversationDialog
          name={name}
          deleteLabel={deleteLabel}
          linkedWork={impact.data?.linkedWork}
          pending={remove.isPending}
          error={remove.error ?? impact.error}
          onClose={close}
          onRestoreFocus={restoreFocus}
          onConfirm={() =>
            remove.mutate(target.id, {
              onSuccess: () => {
                toast.success(`${name} deleted`);
                close();
              },
            })
          }
        />
      )}
    </SettingsPanel>
  );
}
