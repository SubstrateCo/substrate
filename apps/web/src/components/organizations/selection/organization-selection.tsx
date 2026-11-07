import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { CreateOrganizationForm } from "./create-organization-form";
import { SignOutButton } from "@/components/auth/sign-out/sign-out-button";
import { OrganizationSelectionActions } from "@/components/organizations/selection/organization-selection-actions";
import { OrganizationSelection as OrganizationSelectionView } from "@/components/organizations/selection/organization-selection-view";
import { authClient } from "@/lib/auth/client";
import { unwrap } from "@/lib/auth/result";
import { organizationsQueryOptions } from "@/queries/organizations/options";

export function OrganizationSelection() {
  const organizations = useQuery(organizationsQueryOptions());
  const queryClient = useQueryClient();
  const select = useMutation({
    mutationFn: async (organizationId: string) => {
      unwrap(await authClient.organization.setActive({ organizationId }));
      await queryClient.cancelQueries();
      queryClient.clear();
      window.location.assign("/dashboard");
    },
  });
  return (
    <OrganizationSelectionView
      organizations={organizations.data}
      loading={organizations.isPending}
      pending={select.isPending}
      error={select.error}
      loadError={organizations.error}
      onRetry={() => void organizations.refetch()}
      onSelect={(id) => select.mutate(id)}
      signOut={
        <OrganizationSelectionActions
          invitationsHref="/settings/user/invitations"
          signOut={<SignOutButton />}
        />
      }
      createForm={<CreateOrganizationForm />}
    />
  );
}
