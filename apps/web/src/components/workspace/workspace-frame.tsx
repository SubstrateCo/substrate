import { needsYouCount } from "@substrate/contracts/agent-work/needs-you";

import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import type { ReactNode } from "react";

import { isAccessFailure } from "@/api/access-failure";
import { SignOutButton } from "@/components/auth/sign-out/sign-out-button";
import { WorkspaceSearchProvider } from "@/components/context/search/workspace-search-context";
import { WorkspaceTools } from "@/components/context/search/workspace-tools";
import { DesktopUpdateRail } from "@/components/desktop-updates/desktop-update-rail";
import { OrganizationSwitcher } from "@/components/organizations/switcher/organization-switcher";
import { useAppShortcuts } from "@/components/workspace/use-app-shortcuts";
import { useDesktopAttention } from "@/components/workspace/use-desktop-attention";
import { UserMenu } from "@/components/workspace/user-menu";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import { needsYouOptions } from "@/queries/agent-work/server";
import { useAgentWorkBridgeSync } from "@/queries/agent-work/sync";
import { notificationUnreadOptions } from "@/queries/context/notification-groups";
import { unreadCountsOptions } from "@/queries/messaging/read-state";
import { currentOrganizationQueryOptions } from "@/queries/organizations/options";

export function WorkspaceFrame({
  userId,
  organizationId,
  name,
  image,
  children,
}: {
  userId: string;
  organizationId?: string | null;
  name: string;
  image?: string | null;
  children: ReactNode;
}) {
  const organization = useQuery(currentOrganizationQueryOptions(organizationId));
  const notifications = useQuery(notificationUnreadOptions(organizationId));
  const unreadMessages = useQuery(unreadCountsOptions(organizationId));
  const needsYou = useQuery(needsYouOptions(userId, organizationId));
  useAgentWorkBridgeSync(userId, organizationId);
  useAppShortcuts();
  useDesktopAttention(userId);
  return (
    <WorkspaceSearchProvider>
      <WorkspaceShell
        unavailable={isAccessFailure(organization.error)}
        hasUnreadNotifications={!notifications.error && notifications.data?.unread}
        hasUnreadMessages={
          !unreadMessages.error && unreadMessages.data?.some((row) => row.unreadCount > 0)
        }
        agentsNeedYou={!needsYou.error && needsYouCount(needsYou.data) > 0}
        switcher={
          organizationId ? (
            <OrganizationSwitcher organizationId={organizationId} />
          ) : (
            <Link to="/organizations" aria-label="Workspaces">
              OS
            </Link>
          )
        }
        userMenu={
          <UserMenu
            name={name}
            image={image}
            showOrganizationSettings={!!organization.data}
            organizationName={organization.data?.name}
            signOut={<SignOutButton />}
          />
        }
        updateIndicator={<DesktopUpdateRail />}
        error={organization.error}
        loading={!!organizationId && organization.isPending}
        onRetry={() => void organization.refetch()}
      >
        {organizationId && organization.data && !organization.error && (
          <WorkspaceTools key={organizationId} organizationId={organizationId} />
        )}
        {children}
      </WorkspaceShell>
    </WorkspaceSearchProvider>
  );
}
