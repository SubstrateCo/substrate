import { useQuery } from "@tanstack/react-query";

import { CreateOrganizationForm } from "./create-organization-form";
import { PendingInvitations } from "./pending-invitations-view";
import { SignOutButton } from "@/components/auth/sign-out/sign-out-button";
import { actionErrorMessage } from "@/components/feedback/action-error-message";
import { useDeclineInvitationConfirm } from "@/components/organizations/invitations/use-decline-invitation";
import { OrganizationSelection as OrganizationSelectionView } from "@/components/organizations/selection/organization-selection-view";
import { useExpiryTime } from "@/hooks/use-expiry-time";
import { isInvitationExpired } from "@/lib/organizations/invitations";
import { resourceState } from "@/lib/resource-state";
import { userInvitationsQueryOptions } from "@/queries/organizations/invitations";
import { organizationsQueryOptions } from "@/queries/organizations/options";
import { useActivateOrganization } from "@/queries/organizations/selection-mutations";
import { toast } from "sonner";

export function OrganizationSelection({ destination = "/messages" }: { destination?: string }) {
  const organizations = useQuery(organizationsQueryOptions());
  const invitations = useQuery(userInvitationsQueryOptions());
  const now = useExpiryTime(invitations.data?.map((item) => item.expiresAt));
  const select = useActivateOrganization(destination);
  const decline = useDeclineInvitationConfirm();
  // A failed invitation list shows its error in the Invitations group; workspaces still open.
  const pending = (resourceState(invitations).data ?? []).map((item) => ({
    ...item,
    expired: isInvitationExpired(item.expiresAt, now),
  }));
  return (
    <OrganizationSelectionView
      organizations={resourceState(organizations).data}
      state={resourceState(organizations).status}
      // Wait for both lists, so the create form does not collapse when invitations arrive.
      loading={organizations.isPending || invitations.isPending}
      openingId={select.isPending ? select.variables : undefined}
      loadError={organizations.error}
      onRetry={() => void organizations.refetch()}
      onSelect={(id) =>
        select.mutate(id, {
          onError: (error) =>
            toast.error(
              actionErrorMessage(error, "We couldn't open this workspace. Try selecting it again."),
            ),
        })
      }
      signOut={<SignOutButton />}
      createForm={<CreateOrganizationForm destination={destination} />}
      hasInvitations={pending.some((invitation) => !invitation.expired)}
      invitations={
        <>
          <PendingInvitations
            invitations={pending}
            error={invitations.error}
            onRetry={() => void invitations.refetch()}
            decliningId={decline.pendingId}
            onDecline={decline.request}
          />
          {decline.dialog}
        </>
      }
    />
  );
}
