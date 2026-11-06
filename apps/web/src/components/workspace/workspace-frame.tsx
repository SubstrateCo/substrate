import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { WorkspaceShell } from "@startup-os/ui/workspace/workspace-shell";
import {
  activeMemberQueryOptions,
  organizationQueryOptions,
} from "@/queries/organizations/options";
import { organizationSettingsAccess } from "@startup-os/contracts/auth/settings-access";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { OrganizationSwitcher } from "@/components/organizations/organization-switcher";

export function WorkspaceFrame({
  organizationId,
  name,
  children,
}: {
  organizationId?: string | null;
  name: string;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const pathname = useLocation({ select: (location) => location.pathname });
  const organization = useQuery({
    ...organizationQueryOptions(organizationId ?? ""),
    enabled: !!organizationId,
  });
  const member = useQuery({
    ...activeMemberQueryOptions(organizationId ?? ""),
    enabled: !!organizationId,
  });
  const access = organizationSettingsAccess(
    member.data?.organizationId === organizationId ? member.data?.role : undefined,
  );
  let view: "user-settings" | "organization-settings" | "tasks" | "messages" = "messages";
  if (pathname.startsWith("/settings/user")) view = "user-settings";
  else if (pathname.startsWith("/settings/organization")) view = "organization-settings";
  else if (pathname.startsWith("/tasks")) view = "tasks";
  return (
    <WorkspaceShell
      name={name}
      view={view}
      onViewChange={(nextView) => {
        const to = {
          messages: "/dashboard",
          tasks: "/tasks",
          "user-settings": "/settings/user",
          "organization-settings": "/settings/organization",
        } as const;
        void navigate({ to: to[nextView] });
      }}
      showOrganizationSettings={access.allowed}
      organizationName={organization.data?.name}
      switcher={
        organizationId ? (
          <OrganizationSwitcher
            organizationId={organizationId}
            name={organization.data?.name || "Workspace"}
            compact
          />
        ) : (
          <Link to="/organizations" aria-label="Your workspaces">
            OS
          </Link>
        )
      }
      signOut={<SignOutButton />}
      error={organization.error || member.error}
      loading={!!organizationId && (organization.isPending || member.isPending)}
      onRetry={() => {
        void organization.refetch();
        void member.refetch();
      }}
    >
      {children}
    </WorkspaceShell>
  );
}
