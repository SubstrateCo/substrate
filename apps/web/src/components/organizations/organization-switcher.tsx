import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { OrganizationSwitcher as OrganizationSwitcherView } from "@startup-os/ui/organizations/organization-switcher";
import { authClient } from "@/lib/auth-client";
import { organizationsQueryOptions, unwrap } from "@/queries/organizations/options";

export function OrganizationSwitcher({
  organizationId,
  name,
  logo,
  compact = false,
}: {
  organizationId: string;
  name: string;
  logo?: string | null;
  compact?: boolean;
}) {
  const organizations = useQuery(organizationsQueryOptions());
  const queryClient = useQueryClient();
  const switchOrganization = useMutation({
    mutationFn: async (id: string) => {
      unwrap(await authClient.organization.setActive({ organizationId: id }));
      await queryClient.cancelQueries();
      queryClient.clear();
      window.location.assign("/dashboard");
    },
  });
  return (
    <OrganizationSwitcherView
      organizationId={organizationId}
      name={name}
      logo={logo}
      compact={compact}
      organizations={organizations.data || []}
      pending={switchOrganization.isPending}
      loading={organizations.isPending}
      error={switchOrganization.error}
      loadError={organizations.error}
      onRetry={() => void organizations.refetch()}
      onSelect={(id) => switchOrganization.mutate(id)}
      manageHref="/organizations"
    />
  );
}
