import { Link } from "@tanstack/react-router";

import { ErrorState } from "../../feedback/error-state";
import { LoadingState } from "../../feedback/loading-state";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "../../ui/dropdown-menu";
import { OrganizationSwitcherItem } from "./organization-switcher-item";
import { SwitcherTrigger } from "@/components/organizations/switcher/switcher-trigger";
import type { ResourceStatus } from "@/lib/resource-state";
import { Settings } from "lucide-react";

export function OrganizationSwitcher({
  organizationId,
  name,
  logo,
  open,
  onOpenChange,
  organizations,
  state,
  pending = false,
  loadError,
  onRetry,
  onSelect,
  manageHref,
}: {
  organizationId: string;
  name: string;
  logo?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizations: { id: string; name: string; logo?: string | null }[];
  state: ResourceStatus;
  pending?: boolean;
  loading?: boolean;
  loadError?: Error | null;
  onRetry?: () => void;
  onSelect: (id: string) => void;
  manageHref: string;
}) {
  return (
    <div className="relative">
      <DropdownMenu open={open} onOpenChange={onOpenChange}>
        <SwitcherTrigger name={name} logo={logo} pending={pending} />
        <DropdownMenuContent align="start" side="right" sideOffset={12}>
          <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
          {state === "loading" && !organizations.length && (
            <LoadingState label="Loading workspaces…" variant="compact" />
          )}
          {loadError && (
            <ErrorState
              compact
              title="Couldn’t load workspaces"
              description="Try again to update your workspace list."
              onRetry={onRetry}
            />
          )}
          {organizations.map((organization) => (
            <OrganizationSwitcherItem
              key={organization.id}
              organization={organization}
              current={organization.id === organizationId}
              onSelect={() => onSelect(organization.id)}
            />
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link to={manageHref} className="gap-3 px-2 py-2">
              <Settings />
              Manage workspaces
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
