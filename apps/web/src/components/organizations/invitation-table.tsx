import { useMemo } from "react";

import { DateTimeDisplay } from "../table/date-time-cell";
import { AppTable, createAppColumnHelper, dateTimeColumn, useAppTable } from "../table/index";
import { Button } from "../ui/button";
import { ButtonGroup } from "../ui/button-group";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";
import type { InvitationListItem } from "./invitation-manager-view";
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
    <ButtonGroup aria-label="Invitation actions">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="icon"
            variant="outline"
            aria-label="Resend"
            disabled={busy}
            onClick={() => onInvite(invitation.email, invitation.role, true)}
          >
            <Send aria-hidden="true" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Resend invitation</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="icon"
            variant="destructive"
            aria-label="Cancel"
            disabled={busy}
            onClick={() => onCancel(invitation.id)}
          >
            <MailX aria-hidden="true" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Cancel invitation</TooltipContent>
      </Tooltip>
    </ButtonGroup>
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
    <TooltipProvider>
      <AppTable
        table={table}
        name="Invitations"
        loading={loading}
        loadingMessage="Loading invitations…"
        error={error}
        errorTitle="Couldn’t load invitations"
        errorDescription="Your team’s invitations are unavailable. Please try again."
        onRetry={onRetry}
        emptyMessage="No invitations yet."
        renderMobileRow={(invitation) => (
          <>
            <p className="font-medium wrap-anywhere">{invitation.email}</p>
            <dl className="grid grid-cols-3 gap-x-3 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Role</dt>
              <dd className="col-span-2">{invitation.role}</dd>
              <dt className="text-muted-foreground">Status</dt>
              <dd className="col-span-2">
                {invitation.status}
                {invitation.expired ? " · expired" : ""}
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
    </TooltipProvider>
  );
}
