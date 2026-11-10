import { useMemo } from "react";

import { DateTimeDisplay } from "../../table/date-time-cell";
import { AppTable, createAppColumnHelper, dateTimeColumn, useAppTable } from "../../table/index";
import { Button } from "../../ui/button";
import { ButtonGroup } from "../../ui/button-group";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../../ui/tooltip";
import { useDelayedLoading } from "@/hooks/use-delayed-loading";
import { ArrowUpRight } from "lucide-react";

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

function ReviewInvitationAction({ href }: { href: string }) {
  return (
    <ButtonGroup aria-label="Invitation actions">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button asChild variant="outline" size="icon">
            <a href={href} aria-label="Review invitation">
              <ArrowUpRight aria-hidden="true" />
            </a>
          </Button>
        </TooltipTrigger>
        <TooltipContent>Review invitation</TooltipContent>
      </Tooltip>
    </ButtonGroup>
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
    cell: ({ row }) => !row.original.expired && <ReviewInvitationAction href={row.original.href} />,
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
    <TooltipProvider>
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
          emptyMessage="You have no pending invitations."
          renderMobileRow={(invitation) => (
            <>
              <p className="font-medium wrap-anywhere">
                {invitation.organizationName || "Organization"}
              </p>
              <dl className="grid grid-cols-3 gap-x-3 gap-y-2 text-sm">
                <dt className="text-muted-foreground">Role</dt>
                <dd className="col-span-2">{invitation.role}</dd>
                <dt className="text-muted-foreground">Status</dt>
                <dd className="col-span-2">{invitation.expired ? "expired" : "pending"}</dd>
                <dt className="text-muted-foreground">Expires</dt>
                <dd className="col-span-2">
                  <DateTimeDisplay value={invitation.expiresAt} />
                </dd>
              </dl>
              {!invitation.expired && <ReviewInvitationAction href={invitation.href} />}
            </>
          )}
        />
      </div>
    </TooltipProvider>
  );
}
