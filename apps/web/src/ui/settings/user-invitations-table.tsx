import { useMemo } from "react";
import { AppTable, createAppColumnHelper, dateTimeColumn, useAppTable } from "../table";
import { Button } from "../primitives/button";

type UserInvitation = {
  id: string;
  organizationName?: string;
  role: string;
  expiresAt: Date | string;
  href: string;
};

type InvitationRow = UserInvitation & { expired: boolean };
const column = createAppColumnHelper<InvitationRow>();
const emptyInvitations: UserInvitation[] = [];
const columns = column.columns([
  column.accessor((invitation) => invitation.organizationName || "Organization", {
    id: "organization",
    header: "Organization",
  }),
  column.accessor("role", { header: "Role" }),
  column.accessor((invitation) => (invitation.expired ? "expired" : "pending"), {
    id: "status",
    header: "Status",
  }),
  dateTimeColumn<InvitationRow>((invitation) => invitation.expiresAt, {
    id: "expiresAt",
    header: "Expires",
  }),
  column.display({
    id: "actions",
    header: "Actions",
    cell: ({ row }) =>
      !row.original.expired && (
        <Button asChild variant="outline">
          <a href={row.original.href}>Review invitation</a>
        </Button>
      ),
  }),
]);

export function UserInvitationsTable({
  invitations = emptyInvitations,
  loading,
  error,
  onRetry,
  now,
}: {
  invitations?: UserInvitation[];
  loading: boolean;
  error: Error | null;
  onRetry: () => void;
  now: number;
}) {
  const data = useMemo(
    () =>
      invitations.map((invitation) => ({
        ...invitation,
        expired: new Date(invitation.expiresAt).getTime() <= now,
      })),
    [invitations, now],
  );
  const table = useAppTable({ columns, data, getRowId: (row) => row.id });
  return (
    <AppTable
      table={table}
      name="Your invitations"
      loading={loading}
      loadingMessage="Loading your invitations…"
      error={error}
      errorTitle="Couldn’t load your invitations"
      errorDescription="Your invitations are unavailable. Please try again."
      onRetry={onRetry}
      emptyMessage="You have no pending invitations."
    />
  );
}
