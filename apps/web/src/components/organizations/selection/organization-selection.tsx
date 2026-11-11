import { useQuery } from "@tanstack/react-query";

import { CreateOrganizationForm } from "./create-organization-form";
import { SignOutButton } from "@/components/auth/sign-out/sign-out-button";
import { actionErrorMessage } from "@/components/feedback/action-error-message";
import { OrganizationSelection as OrganizationSelectionView } from "@/components/organizations/selection/organization-selection-view";
import { resourceState } from "@/lib/resource-state";
import { organizationsQueryOptions } from "@/queries/organizations/options";
import { useActivateOrganization } from "@/queries/organizations/selection-mutations";
import { toast } from "sonner";

export function OrganizationSelection({ destination = "/dashboard" }: { destination?: string }) {
  const organizations = useQuery(organizationsQueryOptions());
  const select = useActivateOrganization(destination);
  return (
    <OrganizationSelectionView
      organizations={resourceState(organizations).data}
      state={resourceState(organizations).status}
      loading={organizations.isPending}
      pending={select.isPending}
      loadError={organizations.error}
      onRetry={() => void organizations.refetch()}
      onSelect={(id) =>
        select.mutate(id, {
          onError: (error) =>
            toast.error(
              actionErrorMessage(error, "We couldn’t open this workspace. Try selecting it again."),
            ),
        })
      }
      signOut={<SignOutButton />}
      createForm={<CreateOrganizationForm destination={destination} />}
    />
  );
}
