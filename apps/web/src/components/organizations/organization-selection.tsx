import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { OrganizationSelection as OrganizationSelectionView } from "@startup-os/ui/organizations/organization-selection";
import { authClient } from "@/lib/auth-client";
import { organizationsQueryOptions, unwrap } from "@/queries/organizations/options";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { CreateOrganizationForm } from "./create-organization-form";
import { Link } from "@tanstack/react-router";

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
        <div className="flex items-center gap-4">
          <Link to="/settings/user/invitations" className="text-sm underline">
            Your invitations
          </Link>
          <SignOutButton />
        </div>
      }
      createForm={<CreateOrganizationForm />}
    />
  );
}
