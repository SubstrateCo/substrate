import { useMutation, useQuery } from "@tanstack/react-query";

import { CreateOrganizationForm } from "./create-organization-form";
import { SignOutButton } from "@/components/auth/sign-out/sign-out-button";
import { actionErrorMessage } from "@/components/feedback/action-error-message";
import { OrganizationSelectionActions } from "@/components/organizations/selection/organization-selection-actions";
import { OrganizationSelection as OrganizationSelectionView } from "@/components/organizations/selection/organization-selection-view";
import { activateOrganization } from "@/lib/auth/organization";
import { organizationsQueryOptions } from "@/queries/organizations/options";
import { toast } from "sonner";

export function OrganizationSelection({ destination = "/dashboard" }: { destination?: string }) {
  const organizations = useQuery(organizationsQueryOptions());
  const select = useMutation({
    mutationFn: (organizationId: string) => activateOrganization(organizationId, destination),
    onError: (error) =>
      toast.error(
        actionErrorMessage(error, "We couldn’t open this workspace. Try selecting it again."),
      ),
  });
  return (
    <OrganizationSelectionView
      organizations={organizations.data}
      loading={organizations.isPending}
      pending={select.isPending}
      loadError={organizations.error}
      onRetry={() => void organizations.refetch()}
      onSelect={(id) => select.mutate(id)}
      signOut={
        <OrganizationSelectionActions
          invitationsHref="/settings/user/invitations"
          signOut={<SignOutButton />}
        />
      }
      createForm={<CreateOrganizationForm destination={destination} />}
    />
  );
}
