import { useMemo } from "react";

import { RowAction, RowActions } from "../../layout/row-actions";
import { DateTimeDisplay } from "../../table/date-time-cell";
import { AppTable, createAppColumnHelper, dateTimeColumn, useAppTable } from "../../table/index";
import type { InvitationListItem } from "./invitation-manager-view";
import { invitationState } from "./invitation-state";
import { InvitationStatus } from "./invitation-status";
import { roleLabel } from "@/lib/organizations/member-policy";
import { MailX, Send } from "lucide-react";

const column = createAppColumnHelper<InvitationListItem>();
const emptyInvitations: InvitationListItem[] = [];

function InvitationActions({
  invitation,
  busy,
  onInvite,
  onCancel,
}: {
  invitation: InvitationListItem;
  busy: boolean;
  onInvite: (email: string, role: InvitationListItem["role"], resend?: boolean) => void;
  onCancel: (id: string) => void;
}) {
  if (invitation.status !== "pending") return null;
  return (
    <RowActions label="Invitation actions">
      <RowAction
        label={`Resend invitation to ${invitation.email}`}
        disabled={busy}
        onClick={() => onInvite(invitation.email, invitation.role, true)}
      >
        <Send aria-hidden="true" />
      </RowAction>
      <RowAction
        destructive
        label={`Cancel invitation to ${invitation.email}`}
        disabled={busy}
        onClick={() => onCancel(invitation.id)}
      >
        <MailX aria-hidden="true" />
      </RowAction>
    </RowActions>
  );
}

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
        column.accessor("email", {
          header: "Email",
          cell: ({ row }) => (
            <span className="block max-w-56 wrap-anywhere whitespace-normal">
              {row.original.email}
            </span>
          ),
        }),
        column.accessor((invitation) => roleLabel(invitation.role), { id: "role", header: "Role" }),
        column.accessor(
          (invitation) => invitationState(invitation.status, invitation.expired).label,
          {
            id: "status",
            header: "Status",
            cell: ({ row }) => (
              <InvitationStatus status={row.original.status} expired={row.original.expired} />
            ),
          },
        ),
        dateTimeColumn<InvitationListItem>((invitation) => invitation.expiresAt, {
          id: "expiresAt",
          header: "Expires",
        }),
        column.display({
          id: "actions",
          header: () => <span className="sr-only">Actions</span>,
          cell: ({ row }) => (
            <InvitationActions
              invitation={row.original}
              busy={busy}
              onInvite={onInvite}
              onCancel={onCancel}
            />
          ),
        }),
      ]),
    [busy, onInvite, onCancel],
  );
  const table = useAppTable({
    columns,
    data: invitations,
    getRowId: (row) => row.id,
    autoResetPageIndex: false,
  });
  return (
    <AppTable
      table={table}
      name="Invitations"
      loading={loading}
      loadingMessage="Loading invitations…"
      error={error}
      errorTitle="Couldn’t load invitations"
      errorDescription="Your team’s invitations are unavailable. Please try again."
      onRetry={onRetry}
      emptyMessage="No invitations yet"
      emptyDescription="Invitations you send appear here until they are accepted."
      emptyIcon={Send}
      renderMobileRow={(invitation) => (
        <>
          <p className="font-medium wrap-anywhere">{invitation.email}</p>
          <dl className="grid grid-cols-3 gap-x-3 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Role</dt>
            <dd className="col-span-2">{roleLabel(invitation.role)}</dd>
            <dt className="text-muted-foreground">Status</dt>
            <dd className="col-span-2">
              <InvitationStatus status={invitation.status} expired={invitation.expired} />
            </dd>
            <dt className="text-muted-foreground">Expires</dt>
            <dd className="col-span-2">
              <DateTimeDisplay value={invitation.expiresAt} />
            </dd>
          </dl>
          <InvitationActions
            invitation={invitation}
            busy={busy}
            onInvite={onInvite}
            onCancel={onCancel}
          />
        </>
      )}
    />
  );
}
