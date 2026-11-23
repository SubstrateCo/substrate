import { Link } from "@tanstack/react-router";

import { InvitationStatus } from "../invitations/invitation-status";
import { WorkspaceTile } from "../workspace-tile";
import { Timestamp } from "@/components/time/timestamp";
import { Button } from "@/components/ui/button";
import { Item, ItemActions, ItemContent, ItemDescription } from "@/components/ui/item";
import { roleLabel } from "@/lib/organizations/member-policy";

export type PendingInvitation = {
  id: string;
  organizationName?: string;
  role: string;
  expiresAt: Date | string;
  expired: boolean;
};

/** Invitations the user can answer before choosing or creating a workspace. */
export function PendingInvitations({
  invitations,
  decliningId,
  onDecline,
}: {
  invitations: PendingInvitation[];
  /** The invitation being declined, while it is declined. */
  decliningId?: string;
  onDecline: (invitation: PendingInvitation) => void;
}) {
  if (invitations.length === 0) return null;
  return (
    <section className="space-y-2" aria-labelledby="pending-invitations-title">
      <h2 id="pending-invitations-title" className="text-xs font-medium text-muted-foreground">
        Invitations
      </h2>
      {/* Rows line up with the workspace list below: the same avatar column, no frame per row. */}
      <ul aria-label="Your invitations" className="-mx-2.5 space-y-0.5">
        {invitations.map((invitation) => {
          const name = invitation.organizationName || "Workspace";
          return (
            <li key={invitation.id}>
              <Item size="xs" className="flex-nowrap">
                <WorkspaceTile name={name} />
                <ItemContent className="min-w-0">
                  <p className="truncate font-medium">{name}</p>
                  <ItemDescription>
                    {roleLabel(invitation.role)} ·{" "}
                    {invitation.expired ? (
                      <InvitationStatus status="pending" expired />
                    ) : (
                      <>
                        Expires <Timestamp value={invitation.expiresAt} format="date" />
                      </>
                    )}
                  </ItemDescription>
                </ItemContent>
                {!invitation.expired && (
                  <ItemActions className="shrink-0">
                    <Button
                      type="button"
                      variant="destructive-ghost"
                      size="sm"
                      disabled={decliningId === invitation.id}
                      aria-label={`Decline invitation to ${name}`}
                      onClick={() => onDecline(invitation)}
                    >
                      Decline
                    </Button>
                    <Button asChild size="sm">
                      <Link
                        to="/accept-invitation/$invitationId"
                        params={{ invitationId: invitation.id }}
                        aria-label={`Accept invitation to ${name}`}
                      >
                        Accept
                      </Link>
                    </Button>
                  </ItemActions>
                )}
              </Item>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
