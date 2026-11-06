import { organizationSettingsAccess } from "@startup-os/contracts/auth/settings-access";

import { useQuery } from "@tanstack/react-query";
import { useLocation, useNavigate } from "@tanstack/react-router";

import type { ReactNode } from "react";

import { SignOutButton } from "@/components/auth/sign-out-button";
import { OrganizationSwitcher } from "@/components/organizations/organization-switcher";
import { sessionQueryOptions } from "@/queries/auth/session";
import { notificationsOptions } from "@/queries/context/options";
import {
  activeMemberQueryOptions,
  organizationQueryOptions,
} from "@/queries/organizations/options";
import { WorkspaceHomeLink } from "@/ui/workspace/workspace-home-link";
import { WorkspaceShell } from "@/ui/workspace/workspace-shell";

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
  const session = useQuery({ ...sessionQueryOptions(), staleTime: Infinity });
  const pathname = useLocation({ select: (location) => location.pathname });
  const organization = useQuery({
    ...organizationQueryOptions(organizationId ?? ""),
    enabled: !!organizationId,
  });
  const member = useQuery({
    ...activeMemberQueryOptions(organizationId ?? ""),
    enabled: !!organizationId,
  });
  const notifications = useQuery({
    ...notificationsOptions(organizationId ?? ""),
    enabled: !!organizationId,
  });
  const access = organizationSettingsAccess(
    member.data?.organizationId === organizationId ? member.data?.role : undefined,
  );
  let view: "user-settings" | "organization-settings" | "tasks" | "messages" | "notifications" =
    "messages";
  if (pathname.startsWith("/settings/user")) view = "user-settings";
  else if (pathname.startsWith("/settings/organization")) view = "organization-settings";
  else if (pathname.startsWith("/tasks")) view = "tasks";
  else if (pathname.startsWith("/notifications")) view = "notifications";
  return (
    <WorkspaceShell
      name={name}
      image={session.data?.user.image}
      view={view}
      hasUnreadNotifications={
        !notifications.error && notifications.data?.some((item) => !item.readAt)
      }
      onViewChange={(nextView) => {
        const to = {
          messages: "/dashboard",
          tasks: "/tasks",
          notifications: "/notifications",
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
            logo={organization.data?.logo}
            compact
          />
        ) : (
          <WorkspaceHomeLink href="/organizations" />
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
