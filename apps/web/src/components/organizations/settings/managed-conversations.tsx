import { useQuery } from "@tanstack/react-query";

import { useState } from "react";

import { ManagedConversations as ManagedConversationsView } from "./managed-conversations-view";
import { DeleteConversationDialog } from "@/components/messaging/conversations/actions/delete-conversation-dialog";
import { OwnerDialog } from "@/components/messaging/conversations/actions/owner-dialog";
import { AddMembersForm } from "@/components/messaging/conversations/add-members-form";
import { useConversationManagement } from "@/queries/messaging/management";
import {
  deleteImpactQueryOptions,
  managedConversationsQueryOptions,
} from "@/queries/messaging/options";
import { toast } from "sonner";

export function ManagedConversations({ organizationId }: { organizationId: string }) {
  const list = useQuery(managedConversationsQueryOptions(organizationId));
  const [dialog, setDialog] = useState<{ kind: "transfer" | "delete" | "members"; id: string }>();
  const { remove, transfer } = useConversationManagement(organizationId);
  const impact = useQuery({
    ...deleteImpactQueryOptions(organizationId, dialog?.id ?? ""),
    enabled: dialog?.kind === "delete",
  });
  const target = list.data?.find((row) => row.id === dialog?.id);
  const name = target?.name ?? "this group message";
  const close = () => setDialog(undefined);
  return (
    <>
      <ManagedConversationsView
        rows={list.data}
        loading={list.isPending}
        error={list.error}
        onRetry={() => void list.refetch()}
        onAddMembers={(id) =>
          setDialog(
            dialog?.kind === "members" && dialog.id === id ? undefined : { kind: "members", id },
          )
        }
        onTransfer={(id) => setDialog({ kind: "transfer", id })}
        onDelete={(id) => setDialog({ kind: "delete", id })}
        addMembersFor={dialog?.kind === "members" ? dialog.id : undefined}
        addMembersForm={
          dialog?.kind === "members" && (
            <AddMembersForm
              organizationId={organizationId}
              conversationId={dialog.id}
              onClose={close}
            />
          )
        }
      />
      {dialog?.kind === "transfer" && target && (
        <OwnerDialog
          mode="transfer"
          name={name}
          candidates={target.members.filter((person) => person.userId !== target.ownerUserId)}
          pending={transfer.isPending}
          error={transfer.error}
          onClose={close}
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
          linkedWork={impact.data?.linkedWork}
          pending={remove.isPending}
          error={remove.error ?? impact.error}
          onClose={close}
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
    </>
  );
}
