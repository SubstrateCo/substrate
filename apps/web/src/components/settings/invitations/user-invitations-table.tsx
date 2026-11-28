import { Link } from "@tanstack/react-router";

import { createContext, useContext } from "react";

import { DateTimeDisplay } from "../../table/date-time-cell";
import { AppTable, createAppColumnHelper, dateTimeColumn } from "../../table/index";
import { InvitationStatus } from "@/components/organizations/invitations/invitation-status";
import { Button } from "@/components/ui/button";
import { isInvitationExpired } from "@/lib/organizations/invitations";
import { roleLabel } from "@/lib/organizations/member-policy";
import { Mail } from "lucide-react";

type UserInvitation = {
  id: string;
  organizationName?: string;
  role: string;
  expiresAt: Date | string;
};

type InvitationRow = UserInvitation & { expired: boolean };
const column = createAppColumnHelper<InvitationRow>();
const emptyInvitations: UserInvitation[] = [];

function InvitationActions({
  invitation,
  declining,
  onDecline,
}: {
  invitation: InvitationRow;
  declining: boolean;
  onDecline: (invitation: UserInvitation) => void;
}) {
  const organization = invitation.organizationName || "this organization";
  return (
    <div className="flex gap-2">
      <Button
        type="button"
        variant="destructive-ghost"
        size="sm"
        disabled={declining}
        aria-label={`Decline invitation to ${organization}`}
        onClick={() => onDecline(invitation)}
      >
        Decline
      </Button>
      <Button asChild size="sm">
        <Link
          to="/accept-invitation/$invitationId"
          params={{ invitationId: invitation.id }}
          aria-label={`Accept invitation to ${organization}`}
        >
          Accept
        </Link>
      </Button>
    </div>
  );
}

const DeclineContext = createContext<{
  decliningId?: string;
  onDecline: (invitation: UserInvitation) => void;
}>({ onDecline: () => {} });

function ActionsCell({ invitation }: { invitation: InvitationRow }) {
  const { decliningId, onDecline } = useContext(DeclineContext);
  if (invitation.expired) return null;
  return (
    <div className="flex justify-end">
      <InvitationActions
        invitation={invitation}
        declining={decliningId === invitation.id}
        onDecline={onDecline}
      />
    </div>
  );
}

const columns = column.columns([
  column.accessor((invitation) => invitation.organizationName || "Organization", {
    id: "organization",
    header: "Organization",
    cell: ({ getValue }) => (
      <span className="block truncate" title={getValue()}>
        {getValue()}
      </span>
    ),
  }),
  column.accessor((invitation) => roleLabel(invitation.role), {
    id: "role",
    header: "Role",
    meta: { width: "w-28" },
  }),
  column.accessor((invitation) => (invitation.expired ? "expired" : "pending"), {
    id: "status",
    header: "Status",
    meta: { width: "w-28" },
    cell: ({ row }) => <InvitationStatus status="pending" expired={row.original.expired} />,
  }),
  dateTimeColumn<InvitationRow>((invitation) => invitation.expiresAt, {
    id: "expiresAt",
    header: "Expires",
  }),
  column.display({
    id: "actions",
    header: () => <span className="sr-only">Actions</span>,
    meta: { align: "end", controls: true, width: "w-44" },
    cell: ({ row }) => <ActionsCell invitation={row.original} />,
  }),
]);

export function UserInvitationsTable({
  invitations = emptyInvitations,
  loading,
  error,
  onRetry,
  now,
  decliningId,
  onDecline,
}: {
  invitations?: UserInvitation[];
  loading: boolean;
  error: Error | null;
  onRetry: () => void;
  now: number;
  decliningId?: string;
  onDecline: (invitation: UserInvitation) => void;
}) {
  const data = invitations.map((invitation) => ({
    ...invitation,
    expired: isInvitationExpired(invitation.expiresAt, now),
  }));
  return (
    <DeclineContext value={{ decliningId, onDecline }}>
      <AppTable
        name="Your invitations"
        columns={columns}
        data={data}
        getRowId={(row) => row.id}
        loading={loading}
        loadingMessage="Loading your invitations"
        error={error}
        errorTitle="Couldn’t load your invitations"
        onRetry={onRetry}
        empty={{
          variant: "compact",
          title: "No pending invitations",
          description: "When someone invites you to their workspace, you can review it here.",
          icon: Mail,
        }}
        renderMobileRow={(invitation) => (
          <>
            <p className="font-medium wrap-anywhere">
              {invitation.organizationName || "Organization"}
            </p>
            <dl className="grid grid-cols-3 gap-x-3 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Role</dt>
              <dd className="col-span-2">{roleLabel(invitation.role)}</dd>
              <dt className="text-muted-foreground">Status</dt>
              <dd className="col-span-2">
                <InvitationStatus status="pending" expired={invitation.expired} />
              </dd>
              <dt className="text-muted-foreground">Expires</dt>
              <dd className="col-span-2">
                <DateTimeDisplay value={invitation.expiresAt} />
              </dd>
            </dl>
            {!invitation.expired && (
              <InvitationActions
                invitation={invitation}
                declining={decliningId === invitation.id}
                onDecline={onDecline}
              />
            )}
          </>
        )}
      />
    </DeclineContext>
  );
}
