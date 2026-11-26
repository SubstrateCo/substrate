import { useQuery } from "@tanstack/react-query";

import { useState } from "react";

import { actionErrorMessage } from "@/components/feedback/action-error-message";
import { OrganizationSwitcher as OrganizationSwitcherView } from "@/components/organizations/switcher/organization-switcher-view";
import { resourceState } from "@/lib/resource-state";
import {
  currentOrganizationQueryOptions,
  organizationsQueryOptions,
} from "@/queries/organizations/options";
import { useActivateOrganization } from "@/queries/organizations/selection-mutations";
import { toast } from "sonner";

export function OrganizationSwitcher({ organizationId }: { organizationId: string }) {
  const [open, setOpen] = useState(false);
  // The workspace frame holds this read and shows its loading and error states. Until it loads,
  // the trigger shows a generic label.
  const current = useQuery(currentOrganizationQueryOptions(organizationId));
  const name = (current.isSuccess && current.data.name) || "Workspace";
  const logo = current.isSuccess ? current.data.logo : null;
  // Load the list only for the open menu.
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
