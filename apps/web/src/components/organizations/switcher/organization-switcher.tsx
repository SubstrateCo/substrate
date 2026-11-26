import { useQuery } from "@tanstack/react-query";

import { useState } from "react";

import { actionErrorMessage } from "@/components/feedback/action-error-message";
import { OrganizationSwitcher as OrganizationSwitcherView } from "@/components/organizations/switcher/organization-switcher-view";
import { resourceState } from "@/lib/resource-state";
import { organizationsQueryOptions } from "@/queries/organizations/options";
import { useActivateOrganization } from "@/queries/organizations/selection-mutations";
import { toast } from "sonner";

export function OrganizationSwitcher({
  organizationId,
  name,
  logo,
}: {
  organizationId: string;
  name: string;
  logo?: string | null;
}) {
  const [open, setOpen] = useState(false);
  // The trigger shows the active workspace from props; load the list only for the open menu.
  const organizations = useQuery({ ...organizationsQueryOptions(), enabled: open });
  const switchOrganization = useActivateOrganization();
  return (
    <OrganizationSwitcherView
      organizationId={organizationId}
      name={name}
      logo={logo}
      open={open}
      onOpenChange={setOpen}
      organizations={resourceState(organizations).data ?? []}
      state={resourceState(organizations).status}
      pending={switchOrganization.isPending}
      loadError={organizations.error}
      onRetry={() => void organizations.refetch()}
      onSelect={(id) =>
        switchOrganization.mutate(id, {
          onError: (error) =>
            toast.error(
              actionErrorMessage(
                error,
                "We couldn’t switch workspaces. Your current workspace is still open. Try again.",
              ),
            ),
        })
      }
      manageHref="/organizations"
    />
  );
}
