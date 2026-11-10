import { organizationSettingsAccess } from "@startup-os/contracts/auth/settings-access";

import { useQuery } from "@tanstack/react-query";
import { useLocation, useNavigate } from "@tanstack/react-router";

import type { ReactNode } from "react";

import { SignOutButton } from "@/components/auth/sign-out/sign-out-button";
import { WorkspaceSearchProvider } from "@/components/context/search/workspace-search-context";
import { WorkspaceTools } from "@/components/context/search/workspace-tools";
import { OrganizationSwitcher } from "@/components/organizations/switcher/organization-switcher";
import { WorkspaceShell, type WorkspaceView } from "@/components/workspace/workspace-shell";
import { needsYouCount } from "@/lib/agent-work/needs-you";
import { needsYouOptions } from "@/queries/agent-work/server";
import { useAgentWorkBridgeSync } from "@/queries/agent-work/sync";
import { sessionQueryOptions } from "@/queries/auth/session";
import { notificationUnreadOptions } from "@/queries/context/notification-groups";
import {
  activeMemberQueryOptions,
  organizationQueryOptions,
} from "@/queries/organizations/options";

export function WorkspaceFrame({
  userId,
  organizationId,
  name,
  children,
}: {
  userId: string;
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
    ...notificationUnreadOptions(organizationId ?? ""),
    enabled: !!organizationId,
  });
  // Agent notifications are only for work that needs the owner. The server returns nothing for
  // people without agents, so the dot never shows for them.
  const needsYou = useQuery({
    ...needsYouOptions(userId, organizationId ?? ""),
    enabled: !!organizationId,
  });
  useAgentWorkBridgeSync(userId, organizationId);
  const access = organizationSettingsAccess(
    member.data?.organizationId === organizationId ? member.data?.role : undefined,
  );
  let view: WorkspaceView = "messages";
  if (pathname.startsWith("/settings/user")) view = "user-settings";
  else if (pathname.startsWith("/settings/organization")) view = "organization-settings";
  else if (pathname.startsWith("/tasks")) view = "tasks";
  else if (pathname.startsWith("/agents")) view = "agents";
  else if (pathname.startsWith("/notifications")) view = "notifications";
  return (
    <WorkspaceSearchProvider>
      <WorkspaceShell
        name={name}
        image={session.data?.user.image}
        view={view}
        hasUnreadNotifications={!notifications.error && notifications.data?.unread}
        agentsNeedYou={!needsYou.error && needsYouCount(needsYou.data) > 0}
        onViewChange={(nextView) => {
          const to = {
            messages: "/dashboard",
            tasks: "/tasks",
            agents: "/agents",
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
            <a href="/organizations" aria-label="Workspaces">
              OS
            </a>
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
