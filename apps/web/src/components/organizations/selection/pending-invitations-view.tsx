import { InvitationStatus } from "../invitations/invitation-status";
import { Timestamp } from "@/components/time/timestamp";
import { Button } from "@/components/ui/button";
import { Item, ItemActions, ItemContent, ItemDescription } from "@/components/ui/item";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { roleLabel } from "@/lib/organizations/member-policy";
import { initials } from "@/lib/people/initials";
import { Check, X } from "lucide-react";

export type PendingInvitation = {
  id: string;
  organizationName?: string;
  role: string;
  expiresAt: Date | string;
  expired: boolean;
  href: string;
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
      <h2 id="pending-invitations-title" className="text-sm font-semibold">
        Invitations
      </h2>
      {/* Rows line up with the workspace list below: the same avatar column, no frame per row. */}
      <ul aria-label="Your invitations" className="-mx-2.5 space-y-1">
        {invitations.map((invitation) => {
          const name = invitation.organizationName || "Workspace";
          return (
            <li key={invitation.id}>
              <Item size="xs" className="flex-nowrap">
                <span
                  aria-hidden="true"
                  className="flex size-8 shrink-0 items-center justify-center rounded-md bg-accent text-xs font-semibold text-accent-foreground"
                >
                  {initials(name)}
                </span>
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
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          variant="destructive-ghost"
                          size="icon-sm"
                          // oxlint-disable-next-line shadcn/no-restyle -- Decline pairs with Accept as an always-visible answer, so it stays red at rest instead of muted like an icon row action.
                          className="data-[size^=icon]:text-destructive"
                          disabled={decliningId === invitation.id}
                          aria-label={`Decline invitation to ${name}`}
                          onClick={() => onDecline(invitation)}
                        >
                          <X aria-hidden="true" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{`Decline invitation to ${name}`}</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button asChild size="icon-sm">
                          <a href={invitation.href} aria-label={`Accept invitation to ${name}`}>
                            <Check aria-hidden="true" />
                          </a>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{`Accept invitation to ${name}`}</TooltipContent>
                    </Tooltip>
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
