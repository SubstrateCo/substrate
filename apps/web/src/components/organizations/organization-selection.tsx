import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { OrganizationSelection as OrganizationSelectionView } from "@startup-os/ui/organizations/organization-selection";
import { authClient } from "@/lib/auth-client";
import { organizationsQueryOptions, unwrap } from "@/queries/organizations/options";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { CreateOrganizationForm } from "./create-organization-form";

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
      error={organizations.error || select.error}
      failed={organizations.isError}
      onRetry={() => void organizations.refetch()}
      onSelect={(id) => select.mutate(id)}
      signOut={<SignOutButton />}
      createForm={<CreateOrganizationForm />}
    />
  );
}
