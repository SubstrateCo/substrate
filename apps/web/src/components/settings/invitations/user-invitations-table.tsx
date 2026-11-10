import { useMemo } from "react";

import { DateTimeDisplay } from "../../table/date-time-cell";
import { AppTable, createAppColumnHelper, dateTimeColumn, useAppTable } from "../../table/index";
import { Button } from "../../ui/button";
import { InvitationStatus } from "@/components/organizations/invitations/invitation-status";
import { useDelayedLoading } from "@/hooks/use-delayed-loading";
import { roleLabel } from "@/lib/organizations/member-policy";
import { ArrowUpRight, Mail } from "lucide-react";

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

function ReviewInvitationAction({ href, organization }: { href: string; organization: string }) {
  return (
    <Button asChild variant="outline" size="sm">
      <a href={href} aria-label={`Review invitation to ${organization}`}>
        Review
        <ArrowUpRight aria-hidden="true" />
      </a>
    </Button>
  );
}

const columns = column.columns([
  column.accessor((invitation) => invitation.organizationName || "Organization", {
    id: "organization",
    header: "Organization",
    cell: ({ row }) => (
      <span className="block max-w-56 wrap-anywhere whitespace-normal">
        {row.original.organizationName || "Organization"}
      </span>
    ),
  }),
  column.accessor((invitation) => roleLabel(invitation.role), { id: "role", header: "Role" }),
  column.accessor((invitation) => (invitation.expired ? "expired" : "pending"), {
    id: "status",
    header: "Status",
    cell: ({ row }) => <InvitationStatus status="pending" expired={row.original.expired} />,
  }),
  dateTimeColumn<InvitationRow>((invitation) => invitation.expiresAt, {
    id: "expiresAt",
    header: "Expires",
  }),
  column.display({
    id: "actions",
    header: () => <span className="sr-only">Actions</span>,
    cell: ({ row }) =>
      !row.original.expired && (
        <div className="flex justify-end">
          <ReviewInvitationAction
            href={row.original.href}
            organization={row.original.organizationName || "this organization"}
          />
        </div>
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
  const table = useAppTable({
    columns,
    data,
    getRowId: (row) => row.id,
    autoResetPageIndex: false,
  });
  const showLoading = useDelayedLoading(loading);
  return (
    <div className={loading && !showLoading ? "invisible" : undefined}>
      <AppTable
        table={table}
        name="Your invitations"
        loading={loading}
        loadingMessage="Loading your invitations…"
        error={error}
        errorTitle="Couldn’t load your invitations"
        errorDescription="Your invitations are unavailable. Please try again."
        onRetry={onRetry}
        emptyMessage="No pending invitations"
        emptyDescription="When someone invites you to their workspace, you can review it here."
        emptyIcon={Mail}
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
              <ReviewInvitationAction
                href={invitation.href}
                organization={invitation.organizationName || "this organization"}
              />
            )}
          </>
        )}
      />
    </div>
  );
}
