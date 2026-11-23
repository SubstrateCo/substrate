import { useMemo } from "react";

import { CopyButton } from "../../feedback/copy-button";
import { RowAction, RowActions } from "../../layout/row-actions";
import { DateTimeDisplay } from "../../table/date-time-cell";
import { AppTable, createAppColumnHelper, dateTimeColumn } from "../../table/index";
import type { InvitationListItem } from "./invitation-manager-view";
import { invitationState } from "./invitation-state";
import { InvitationStatus } from "./invitation-status";
import { roleLabel } from "@/lib/organizations/member-policy";
import { MailX, Send } from "lucide-react";

const column = createAppColumnHelper<InvitationListItem>();
const emptyInvitations: InvitationListItem[] = [];

const columns = column.columns([
  column.accessor("email", {
    header: "Email",
    cell: ({ row }) => (
      <span className="block wrap-anywhere whitespace-normal">{row.original.email}</span>
    ),
  }),
  column.accessor((invitation) => roleLabel(invitation.role), { id: "role", header: "Role" }),
  column.accessor((invitation) => invitationState(invitation.status, invitation.expired).label, {
    id: "status",
    header: "Status",
    cell: ({ row }) => (
      <InvitationStatus status={row.original.status} expired={row.original.expired} />
    ),
  }),
  dateTimeColumn<InvitationListItem>((invitation) => invitation.expiresAt, {
    id: "expiresAt",
    header: "Expires",
  }),
]);

type ActionProps = {
  busy: boolean;
  onInvite: (email: string, role: InvitationListItem["role"], resend?: boolean) => void;
  onCancel: (id: string) => void;
  onCopyLink: (id: string) => Promise<void>;
};

function InvitationActions({
  invitation,
  busy,
  onInvite,
  onCancel,
  onCopyLink,
}: ActionProps & { invitation: InvitationListItem }) {
  if (invitation.status !== "pending") return null;
  return (
    <>
      {!invitation.expired && (
        // oxlint-disable-next-line design/icon-button-name, design/icon-button-tooltip -- CopyButton uses `label` as its aria-label and tooltip.
        <CopyButton
          grouped
          size="icon-sm"
          label={`Copy invite link for ${invitation.email}`}
          successMessage="Invite link copied"
          errorMessage="Couldn’t copy the invite link"
          onCopy={() => onCopyLink(invitation.id)}
        />
      )}
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
    </>
  );
}

export function InvitationTable({
  invitations = emptyInvitations,
  loading,
  error,
  onRetry,
  ...actions
}: ActionProps & {
  invitations?: InvitationListItem[];
  loading: boolean;
  error?: Error | null;
  onRetry: () => void;
}) {
  const { busy, onInvite, onCancel, onCopyLink } = actions;
  const rowActions = useMemo(
    () => ({
      label: () => "Invitation actions",
      render: (invitation: InvitationListItem) => (
        <InvitationActions
          invitation={invitation}
          busy={busy}
          onInvite={onInvite}
          onCancel={onCancel}
          onCopyLink={onCopyLink}
        />
      ),
    }),
    [busy, onInvite, onCancel, onCopyLink],
  );
  return (
    <AppTable
      name="Invitations"
      columns={columns}
      data={invitations}
      getRowId={(row) => row.id}
      loading={loading}
      loadingMessage="Loading invitations"
      error={error}
      errorTitle="Couldn’t load invitations"
      errorDescription="Your team’s invitations are unavailable. Please try again."
      onRetry={onRetry}
      empty={{
        title: "No invitations yet",
        description: "Invitations you send appear here until they are accepted.",
        icon: Send,
      }}
      rowActions={rowActions}
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
          <RowActions label="Invitation actions">
            <InvitationActions invitation={invitation} {...actions} />
          </RowActions>
        </>
      )}
    />
  );
}
