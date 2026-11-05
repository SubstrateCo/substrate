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
}: {
  organizationId: string;
  name: string;
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
    <div className="space-y-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" disabled={switchOrganization.isPending}>
            {switchOrganization.isPending ? "Switching…" : name} ▾
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
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
      <FormMessage error={switchOrganization.error || organizations.error} />
    </div>
  );
}
