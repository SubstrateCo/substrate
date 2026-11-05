import { useMemo } from "react";
import { AppTable, createAppColumnHelper, dateTimeColumn, useAppTable } from "../table";
import { Button } from "../primitives/button";
import type { InvitationListItem } from "./invitation-manager";

const column = createAppColumnHelper<InvitationListItem>();
const emptyInvitations: InvitationListItem[] = [];

export function InvitationTable({
  invitations = emptyInvitations,
  loading,
  error,
  busy,
  onRetry,
  onInvite,
  onCancel,
}: {
  invitations?: InvitationListItem[];
  loading: boolean;
  error?: Error | null;
  busy: boolean;
  onRetry: () => void;
  onInvite: (email: string, role: InvitationListItem["role"], resend?: boolean) => void;
  onCancel: (id: string) => void;
}) {
  const columns = useMemo(
    () =>
      column.columns([
        column.accessor("email", { header: "Email" }),
        column.accessor("role", { header: "Role" }),
        column.accessor(
          (invitation) =>
            invitation.expired ? `${invitation.status} · expired` : invitation.status,
          { id: "status", header: "Status" },
        ),
        dateTimeColumn<InvitationListItem>((invitation) => invitation.expiresAt, {
          id: "expiresAt",
          header: "Expires",
        }),
        column.display({
          id: "actions",
          header: "Actions",
          cell: ({ row }) =>
            row.original.status === "pending" && (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => onInvite(row.original.email, row.original.role, true)}
                >
                  Resend
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => onCancel(row.original.id)}
                >
                  Cancel
                </Button>
              </div>
            ),
        }),
      ]),
    [busy, onInvite, onCancel],
  );
  const table = useAppTable({
    columns,
    data: invitations,
    getRowId: (row) => row.id,
  });
  return (
    <AppTable
      table={table}
      name="Invitations"
      loading={loading}
      loadingMessage="Loading invitations…"
      error={error}
      onRetry={onRetry}
      emptyMessage="No invitations yet."
    />
  );
}
