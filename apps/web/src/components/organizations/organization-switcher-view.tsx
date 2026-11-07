import { FormMessage } from "../auth/form-message";
import { ErrorState } from "../feedback/error-state";
import { LoadingState } from "../feedback/loading-state";
import { isAccessFailure } from "../feedback/request-failure";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "../ui/dropdown-menu";
import { OrganizationSwitcherItem } from "./organization-switcher-item";
import { SwitcherTrigger } from "@/components/organizations/organization-switcher/switcher-trigger";
import { Settings2 } from "lucide-react";

export function OrganizationSwitcher({
  organizationId,
  name,
  logo,
  compact = false,
  organizations,
  pending = false,
  loading = false,
  error,
  loadError,
  onRetry,
  onSelect,
  manageHref,
}: {
  organizationId: string;
  name: string;
  logo?: string | null;
  compact?: boolean;
  organizations: { id: string; name: string; logo?: string | null }[];
  pending?: boolean;
  loading?: boolean;
  error?: Error | null;
  loadError?: Error | null;
  onRetry?: () => void;
  onSelect: (id: string) => void;
  manageHref: string;
}) {
  return (
    <div className={compact ? "relative" : "space-y-2"}>
      <DropdownMenu>
        <SwitcherTrigger name={name} logo={logo} compact={compact} pending={pending} />
        <DropdownMenuContent
          align="start"
          side={compact ? "right" : "bottom"}
          sideOffset={12}
          className="w-64"
        >
          <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
          {loading && !organizations.length && !isAccessFailure(loadError) && (
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
          {!isAccessFailure(loadError) &&
            organizations.map((organization) => (
              <OrganizationSwitcherItem
                key={organization.id}
                organization={organization}
                current={organization.id === organizationId}
                onSelect={() => onSelect(organization.id)}
              />
            ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <a href={manageHref} className="gap-3 px-2 py-2">
              <Settings2 />
              Manage workspaces
            </a>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <FormMessage
        floating={compact}
        error={error}
        errorDescription="We couldn’t switch workspaces. Your current workspace is still open. Try again."
      />
    </div>
  );
}
