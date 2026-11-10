import { useQuery } from "@tanstack/react-query";

import { useRef, useState } from "react";

import { ManagedConversations as ManagedConversationsView } from "./managed-conversations-view";
import { isAccessFailure } from "@/components/feedback/request-failure";
import { SettingsPanel } from "@/components/layout/settings-page";
import { DeleteConversationDialog } from "@/components/messaging/conversations/actions/delete-conversation-dialog";
import { OwnerDialog } from "@/components/messaging/conversations/actions/owner-dialog";
import { AddMembersDialog } from "@/components/messaging/conversations/add-members-dialog";
import { conversationLabel, humanMembers } from "@/lib/messaging/conversations";
import { useConversationManagement } from "@/queries/messaging/management";
import {
  deleteImpactQueryOptions,
  managedConversationsQueryOptions,
} from "@/queries/messaging/options";
import { toast } from "sonner";

export function ManagedConversations({ organizationId }: { organizationId: string }) {
  const list = useQuery(managedConversationsQueryOptions(organizationId));
  const [dialog, setDialog] = useState<{ kind: "transfer" | "delete" | "members"; id: string }>();
  const launcher = useRef<HTMLElement | null>(null);
  const fallback = useRef<HTMLDivElement>(null);
  const { remove, transfer } = useConversationManagement(organizationId);
  const impact = useQuery({
    ...deleteImpactQueryOptions(organizationId, dialog?.id ?? ""),
    enabled: dialog?.kind === "delete",
  });
  const target = isAccessFailure(list.error)
    ? undefined
    : list.data?.find((row) => row.id === dialog?.id);
  const name = target
    ? conversationLabel({ ...target, name: target.name ?? "this group message" })
    : "this group message";
  const deleteLabel = target?.kind === "channel" ? "Delete channel" : "Delete group";
  const close = () => setDialog(undefined);
  const restoreFocus = () => {
    if (launcher.current?.isConnected) launcher.current.focus();
    else fallback.current?.focus();
  };
  const open = (
    kind: "transfer" | "delete" | "members",
    id: string,
    trigger: HTMLElement | null,
  ) => {
    launcher.current = trigger;
    setDialog({ kind, id });
  };
  return (
    <SettingsPanel
      title="Conversations"
      description="Every channel and group message in this organization. You see names and members, never messages."
    >
      <div ref={fallback} tabIndex={-1}>
        <ManagedConversationsView
          rows={list.data}
          loading={list.isPending}
          error={list.error}
          onRetry={() => void list.refetch()}
          onAddMembers={(id, trigger) => open("members", id, trigger)}
          onTransfer={(id, trigger) => open("transfer", id, trigger)}
          onDelete={(id, trigger) => open("delete", id, trigger)}
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
