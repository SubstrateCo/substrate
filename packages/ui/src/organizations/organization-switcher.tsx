import { ChevronsUpDown, Settings2 } from "lucide-react";
import { OrganizationSwitcherItem } from "./organization-switcher-item";
import { Button } from "../primitives/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../primitives/dropdown-menu";
import { FormMessage } from "../auth/form-message";
import { ErrorState } from "../feedback/error-state";
import { LoadingState } from "../feedback/loading-state";
import { Spinner } from "../primitives/spinner";
import { PicturePreview } from "../upload/picture-preview";
import { isAccessFailure } from "../feedback/request-failure";

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
        <DropdownMenuTrigger asChild>
          <Button
            variant={compact ? "workspace" : "outline"}
            size={compact ? "icon-lg" : "default"}
            aria-label={`${name} ▾`}
            title={compact ? `Switch workspace: ${name}` : undefined}
            disabled={pending}
            aria-busy={pending}
          >
            {compact ? (
              <span
                aria-hidden="true"
                className="flex size-6 items-center justify-center overflow-hidden rounded-md text-xs font-semibold"
              >
                {pending ? (
                  <Spinner aria-hidden="true" role="presentation" />
                ) : (
                  <PicturePreview
                    src={logo}
                    className="size-full object-contain"
                    fallback={name
                      .split(/\s+/)
                      .filter(Boolean)
                      .slice(0, 2)
                      .map((word) => word[0])
                      .join("")
                      .toUpperCase()}
                  />
                )}
              </span>
            ) : (
              <>
                {logo && (
                  <span aria-hidden="true" className="size-5 overflow-hidden rounded-md">
                    <PicturePreview
                      src={logo}
                      className="size-full object-contain"
                      fallback={null}
                    />
                  </span>
                )}
                <span className="max-w-48 truncate">{pending ? "Switching…" : name}</span>
                {pending ? (
                  <Spinner aria-hidden="true" role="presentation" />
                ) : (
                  <ChevronsUpDown className="size-4 text-muted-foreground" />
                )}
              </>
            )}
          </Button>
        </DropdownMenuTrigger>
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
        error={error}
        errorDescription="We couldn’t switch workspaces. Your current workspace is still open. Try again."
      />
    </div>
  );
}
