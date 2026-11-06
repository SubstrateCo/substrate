import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { CreateOrganizationForm } from "./create-organization-form";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { authClient } from "@/lib/auth-client";
import { organizationsQueryOptions, unwrap } from "@/queries/organizations/options";
import { OrganizationSelection as OrganizationSelectionView } from "@/ui/organizations/organization-selection";
import { OrganizationSelectionActions } from "@/ui/organizations/organization-selection-actions";

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
