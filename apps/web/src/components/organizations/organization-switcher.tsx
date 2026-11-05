import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";
import { organizationsQueryOptions, unwrap } from "@/queries/organizations/options";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FormMessage } from "@/components/auth/form-message";

export function OrganizationSwitcher({
  organizationId,
  name,
  compact = false,
}: {
  organizationId: string;
  name: string;
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
  const error = switchOrganization.error || organizations.error;
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
            disabled={switchOrganization.isPending}
          >
            {compact ? (
              <span aria-hidden="true" className="text-xs font-semibold">
                {switchOrganization.isPending
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
              <>{switchOrganization.isPending ? "Switching…" : name} ▾</>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side={compact ? "right" : "bottom"}>
          {organizations.data?.map((organization) => (
            <DropdownMenuItem
              key={organization.id}
              disabled={organization.id === organizationId}
              onSelect={() => switchOrganization.mutate(organization.id)}
            >
              {organization.name}
              {organization.id === organizationId ? " (current)" : ""}
            </DropdownMenuItem>
          ))}
          <DropdownMenuItem asChild>
            <a href="/organizations">Manage workspaces</a>
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
