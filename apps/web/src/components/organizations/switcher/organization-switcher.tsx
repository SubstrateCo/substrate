import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { actionErrorMessage } from "@/components/feedback/action-error-message";
import { OrganizationSwitcher as OrganizationSwitcherView } from "@/components/organizations/switcher/organization-switcher-view";
import { authClient } from "@/lib/auth/client";
import { unwrap } from "@/lib/auth/result";
import { organizationsQueryOptions } from "@/queries/organizations/options";
import { toast } from "sonner";

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
    onError: (error) =>
      toast.error(
        actionErrorMessage(
          error,
          "We couldn’t switch workspaces. Your current workspace is still open. Try again.",
        ),
      ),
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
      loadError={organizations.error}
      onRetry={() => void organizations.refetch()}
      onSelect={(id) => switchOrganization.mutate(id)}
      manageHref="/organizations"
    />
  );
}
