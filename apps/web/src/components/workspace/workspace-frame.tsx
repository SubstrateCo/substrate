import { organizationSettingsAccess } from "@startup-os/contracts/auth/settings-access";

import { useQuery } from "@tanstack/react-query";
import { useLocation, useNavigate } from "@tanstack/react-router";

import type { ReactNode } from "react";

import { SignOutButton } from "@/components/auth/sign-out/sign-out-button";
import { WorkspaceSearchProvider } from "@/components/context/search/workspace-search-context";
import { WorkspaceTools } from "@/components/context/search/workspace-tools";
import { OrganizationSwitcher } from "@/components/organizations/switcher/organization-switcher";
import { WorkspaceHomeLink } from "@/components/workspace/workspace-home-link";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import { sessionQueryOptions } from "@/queries/auth/session";
import { notificationPageOptions } from "@/queries/context/notifications";
import {
  activeMemberQueryOptions,
  organizationQueryOptions,
} from "@/queries/organizations/options";

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
  // The dot needs only to know whether one unread notification exists.
  const notifications = useQuery({
    ...notificationPageOptions(organizationId ?? "", "unread", undefined, 1),
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
    <WorkspaceSearchProvider>
      <WorkspaceShell
        name={name}
        image={session.data?.user.image}
        view={view}
        hasUnreadNotifications={
          !notifications.error && notifications.data?.items.some((item) => !item.readAt)
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
        {organizationId && organization.data && !organization.error && (
          <WorkspaceTools key={organizationId} organizationId={organizationId} />
        )}
        {children}
      </WorkspaceShell>
    </WorkspaceSearchProvider>
  );
}
