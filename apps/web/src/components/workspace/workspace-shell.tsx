import { useContext, type ReactNode } from "react";

import { ErrorState } from "../feedback/error-state";
import { LoadingState } from "../feedback/loading-state";
import { UserMenu } from "./user-menu";
import { notificationsApp, workspaceApps, type WorkspaceAppId } from "./workspace-apps";
import { RealtimeContainerContext } from "@/components/realtime/realtime-container-context";
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
  const badges: Partial<
    Record<
      WorkspaceAppId,
      { unread: boolean; unreadLabel?: string; dotTone?: "primary" | "warning" }
    >
  > = {
    messages: { unread: hasUnreadMessages, unreadLabel: "unread messages" },
    agents: { unread: agentsNeedYou, unreadLabel: "needs you", dotTone: "warning" },
  };
  return (
    <main data-workspace-shell className="flex h-(--app-height) min-h-0 overflow-hidden bg-rail">
      <nav
        aria-label="Apps"
        className="z-20 flex w-14 shrink-0 flex-col items-center gap-3 bg-rail py-3 text-rail-foreground"
      >
        {switcher}
        {workspaceApps.map(({ id, ...app }) => (
          <WorkspaceAppButton key={id} {...app} {...badges[id]} />
        ))}
        <div className="mt-auto flex flex-col items-center gap-3">
          {updateIndicator}
          <WorkspaceAppButton {...notificationsApp} unread={hasUnreadNotifications} />
          <UserMenu
            name={name}
            image={image}
            showOrganizationSettings={showOrganizationSettings}
            organizationName={organizationName}
            signOut={signOut}
          />
        </div>
      </nav>
      <div
        ref={realtimeContainerRef}
        className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-tl-2xl bg-surface"
      >
        {loading && (
          // Same height as the search bar that replaces it, so the page does not jump when it loads.
          <div className="box-content flex h-14 shrink-0 items-center border-b px-3 *:flex-1">
            <LoadingState label="Loading workspace details…" variant="compact" rows={1} />
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
