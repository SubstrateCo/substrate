import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { AppTable, createAppColumnHelper, dateTimeColumn, useAppTable } from "@startup-os/ui/table";
import { Button } from "@startup-os/ui/primitives/button";
import { useCurrentTime } from "@/hooks/use-current-time";

type UserInvitation = {
  id: string;
  organizationName?: string;
  role: string;
  expiresAt: Date | string;
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
          <Link to="/accept-invitation/$invitationId" params={{ invitationId: row.original.id }}>
            Review invitation
          </Link>
        </Button>
      ),
  }),
]);

export function UserInvitationsTable({
  invitations = emptyInvitations,
  loading,
  error,
  onRetry,
}: {
  invitations?: UserInvitation[];
  loading: boolean;
  error: Error | null;
  onRetry: () => void;
}) {
  const now = useCurrentTime();
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
