import { Link } from "@tanstack/react-router";

import { InvitationStatus } from "../invitations/invitation-status";
import { WorkspaceTile } from "../workspace-tile";
import { ErrorState } from "@/components/feedback/error-state";
import { Timestamp } from "@/components/time/timestamp";
import { Button } from "@/components/ui/button";
import { Heading } from "@/components/ui/heading";
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
  error,
  onRetry,
  decliningId,
  onDecline,
}: {
  invitations: PendingInvitation[];
  error?: Error | null;
  onRetry: () => void;
  /** The invitation being declined, while it is declined. */
  decliningId?: string;
  onDecline: (invitation: PendingInvitation) => void;
}) {
  if (invitations.length === 0 && !error) return null;
  return (
    <section className="space-y-2" aria-labelledby="pending-invitations-title">
      <Heading level={2} variant="label" id="pending-invitations-title">
        Invitations
      </Heading>
      {error && (
        <ErrorState
          compact
          title="Couldn’t load invitations"
          description="Your invitations are unavailable. You can still open or create a workspace."
          onRetry={onRetry}
        />
      )}
      {/* Rows line up with the workspace list below: the same avatar column, no frame per row. */}
      {invitations.length > 0 && (
        <ul aria-label="Your invitations" className="-mx-2.5 space-y-0.5">
          {invitations.map((invitation) => {
            const name = invitation.organizationName || "Workspace";
            return (
              <li key={invitation.id}>
                <Item size="xs" className="sm:flex-nowrap">
                  <WorkspaceTile name={name} />
                  <ItemContent className="min-w-0">
                    <p className="font-medium wrap-anywhere sm:truncate">{name}</p>
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
                    <ItemActions className="basis-full justify-end sm:shrink-0 sm:basis-auto">
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
      )}
    </section>
  );
}
