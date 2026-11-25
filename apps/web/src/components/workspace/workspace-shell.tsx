import { isOptionalApp } from "@substrate/contracts/apps";

import { useContext, type ReactNode } from "react";

import { ErrorState } from "../feedback/error-state";
import { UserMenu } from "./user-menu";
import { notificationsApp, workspaceApps, type WorkspaceAppId } from "./workspace-apps";
import { LoadingState } from "@/components/feedback/loading-state";
import { RealtimeContainerContext } from "@/components/realtime/realtime-container-context";
import { useOrganizationApps } from "@/components/workspace/organization-apps";
import { WorkspaceAppButton } from "@/components/workspace/workspace-app-button";

export function WorkspaceShell({
  name,
  unavailable,
  image,
  showOrganizationSettings,
  organizationName,
  switcher,
  signOut,
  updateIndicator,
  error,
  loading = false,
  onRetry,
  children,
  hasUnreadNotifications = false,
  hasUnreadMessages = false,
  agentsNeedYou = false,
}: {
  name: string;
  unavailable: boolean;
  image?: string | null;
  hasUnreadNotifications?: boolean;
  hasUnreadMessages?: boolean;
  /** One of the viewer's agents waits for an answer, an approval, or a decision. */
  agentsNeedYou?: boolean;
  showOrganizationSettings: boolean;
  organizationName?: string;
  switcher: ReactNode;
  signOut: ReactNode;
  updateIndicator?: ReactNode;
  error?: Error | null;
  loading?: boolean;
  onRetry?: () => void;
  children: ReactNode;
}) {
  const realtimeContainerRef = useContext(RealtimeContainerContext);
  const apps = useOrganizationApps();
  const badges: Partial<
    Record<
      WorkspaceAppId,
      { unread: boolean; unreadLabel?: string; dotTone?: "primary" | "warning" }
    >
  > = {
    messages: { unread: hasUnreadMessages, unreadLabel: "unread messages" },
    agents: { unread: agentsNeedYou, unreadLabel: "needs you", dotTone: "warning" },
  };
  const visibleApps = workspaceApps.filter(({ id }) => !isOptionalApp(id) || apps.enabled(id));
  // Agents sit at the bottom of the rail, above Notifications.
  const topApps = visibleApps.filter(({ id }) => id !== "agents");
  const bottomApps = visibleApps.filter(({ id }) => id === "agents");
  return (
    <main
      data-workspace-shell
      className="group/shell flex h-(--app-height) min-h-0 flex-col-reverse overflow-hidden bg-rail md:flex-row"
    >
      <nav
        aria-label="Apps"
        // oxlint-disable-next-line shadcn/no-arbitrary-values -- The bottom rail must clear the device safe area, which has no spacing token.
        className="z-20 flex min-h-0 w-full shrink-0 items-center gap-2 bg-rail px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] text-rail-foreground max-md:group-has-data-meeting-archive/shell:hidden md:w-14 md:flex-col md:gap-3 md:overflow-x-hidden md:overflow-y-auto md:px-0 md:py-3 [&>*]:shrink-0"
      >
        {switcher}
        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto overscroll-contain md:contents">
          {topApps.map(({ id, ...app }) => (
            <WorkspaceAppButton key={id} {...app} {...badges[id]} />
          ))}
          <div className="ml-auto flex shrink-0 items-center gap-2 md:mt-auto md:ml-0 md:flex-col md:gap-3">
            {updateIndicator}
            {bottomApps.map(({ id, ...app }) => (
              <WorkspaceAppButton key={id} {...app} {...badges[id]} />
            ))}
            <WorkspaceAppButton {...notificationsApp} unread={hasUnreadNotifications} />
          </div>
        </div>
        <UserMenu
          name={name}
          image={image}
          showOrganizationSettings={showOrganizationSettings}
          organizationName={organizationName}
          signOut={signOut}
        />
      </nav>
      <div
        ref={realtimeContainerRef}
        className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-surface md:rounded-tl-2xl"
      >
        {loading && (
          // Same height as the search bar that replaces it, so the page does not jump when it loads.
          <div className="box-content flex h-14 shrink-0 items-center border-b px-3 *:flex-1">
            <LoadingState label="Loading workspace details" variant="compact" rows={1} />
          </div>
        )}
        {error && (
          <div className="shrink-0 p-3">
            <ErrorState
              compact
              title="Couldn’t load workspace details"
              description="Some workspace controls may be unavailable. Try again to update your workspace details."
              onRetry={onRetry}
            />
          </div>
        )}
        {!unavailable && children}
      </div>
    </main>
  );
}
