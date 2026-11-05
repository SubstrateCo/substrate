import { Button } from "../primitives/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../primitives/dropdown-menu";
import { FormMessage } from "../auth/form-message";

export function OrganizationSwitcher({
  organizationId,
  name,
  compact = false,
  organizations,
  pending = false,
  error,
  onSelect,
  manageHref,
}: {
  organizationId: string;
  name: string;
  compact?: boolean;
  organizations: { id: string; name: string }[];
  pending?: boolean;
  error?: Error | null;
  onSelect: (id: string) => void;
  manageHref: string;
}) {
  return (
    <div className={compact ? "relative" : "space-y-2"}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant={compact ? "ghost" : "outline"}
            size={compact ? "icon-lg" : "default"}
            className={
              compact
                ? "rounded-xl bg-white text-[#191b24] hover:bg-white/90 hover:text-[#191b24]"
                : undefined
            }
            aria-label={compact ? `${name} ▾` : undefined}
            title={compact ? `Switch workspace: ${name}` : undefined}
            disabled={pending}
          >
            {compact ? (
              <span aria-hidden="true" className="text-xs font-semibold">
                {pending
                  ? "…"
                  : name
                      .split(/\s+/)
                      .filter(Boolean)
                      .slice(0, 2)
                      .map((word) => word[0])
                      .join("")
                      .toUpperCase()}
              </span>
            ) : (
              <>{pending ? "Switching…" : name} ▾</>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side={compact ? "right" : "bottom"}>
          {organizations.map((organization) => (
            <DropdownMenuItem
              key={organization.id}
              disabled={organization.id === organizationId}
              onSelect={() => onSelect(organization.id)}
            >
              {organization.name}
              {organization.id === organizationId ? " (current)" : ""}
            </DropdownMenuItem>
          ))}
          <DropdownMenuItem asChild>
            <a href={manageHref}>Manage workspaces</a>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {error && (
        <div
          className={
            compact ? "absolute top-0 left-full z-50 ml-2 w-56 text-foreground" : undefined
          }
        >
          <FormMessage error={error} />
        </div>
      )}
    </div>
  );
}
