import { Check, ChevronsUpDown, Settings2 } from "lucide-react";
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

export function OrganizationSwitcher({
  organizationId,
  name,
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
  compact?: boolean;
  organizations: { id: string; name: string }[];
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
              <span aria-hidden="true" className="text-xs font-semibold">
                {pending ? (
                  <Spinner aria-hidden="true" role="presentation" />
                ) : (
                  name
                    .split(/\s+/)
                    .filter(Boolean)
                    .slice(0, 2)
                    .map((word) => word[0])
                    .join("")
                    .toUpperCase()
                )}
              </span>
            ) : (
              <>
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
          {loading && <LoadingState label="Loading workspaces…" variant="compact" />}
          {loadError && (
            <ErrorState
              compact
              title="Couldn’t load workspaces"
              description="Try again to update your workspace list."
              onRetry={onRetry}
            />
          )}
          {!loading &&
            organizations.map((organization) => (
              <DropdownMenuItem
                key={organization.id}
                disabled={organization.id === organizationId}
                aria-label={`${organization.name}${organization.id === organizationId ? " (current)" : ""}`}
                variant="workspace"
                onSelect={() => onSelect(organization.id)}
              >
                <span
                  aria-hidden="true"
                  className="flex size-8 shrink-0 items-center justify-center rounded-lg border bg-surface text-xs font-semibold text-foreground shadow-surface"
                >
                  {organization.name
                    .split(/\s+/)
                    .filter(Boolean)
                    .slice(0, 2)
                    .map((word) => word[0])
                    .join("")
                    .toUpperCase()}
                </span>
                <span className="min-w-0 flex-1 truncate">{organization.name}</span>
                {organization.id === organizationId && <Check className="size-4 shrink-0" />}
              </DropdownMenuItem>
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
