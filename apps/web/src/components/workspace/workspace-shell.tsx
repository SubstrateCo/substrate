import { useContext, type ReactNode } from "react";

import { ErrorState } from "../feedback/error-state";
import { LoadingState } from "../feedback/loading-state";
import { isAccessFailure } from "../feedback/request-failure";
import { TooltipProvider } from "../ui/tooltip";
import { UserMenu } from "./user-menu";
import { RealtimeContainerContext } from "@/components/realtime/realtime-container-context";
import { WorkspaceAppButton } from "@/components/workspace/workspace-shell/workspace-app-button";
import { Bell, Bot, ListTodo, MessageSquare } from "lucide-react";

export type WorkspaceView =
  | "messages"
  | "tasks"
  | "agents"
  | "notifications"
  | "user-settings"
  | "organization-settings";

export function WorkspaceShell({
  name,
  image,
  view,
  onViewChange,
  showOrganizationSettings,
  organizationName,
  switcher,
  signOut,
  error,
  loading = false,
  onRetry,
  children,
  hasUnreadNotifications = false,
  agentsNeedYou = false,
}: {
  name: string;
  image?: string | null;
  view: WorkspaceView;
  onViewChange: (view: WorkspaceView) => void;
  hasUnreadNotifications?: boolean;
  /** One of the viewer's agents waits for an answer, an approval, or a decision. */
  agentsNeedYou?: boolean;
  showOrganizationSettings: boolean;
  organizationName?: string;
  switcher: ReactNode;
  signOut: ReactNode;
  error?: Error | null;
  loading?: boolean;
  onRetry?: () => void;
  children: ReactNode;
}) {
  const realtimeContainerRef = useContext(RealtimeContainerContext);
  return (
    <main data-workspace-shell className="flex h-(--app-height) min-h-0 overflow-hidden bg-rail">
      <TooltipProvider delayDuration={350}>
        <nav
          aria-label="Apps"
          className="z-20 flex w-14 shrink-0 flex-col items-center gap-3 bg-rail py-3 text-rail-foreground"
        >
          {switcher}
          <WorkspaceAppButton
            label="Messages"
            icon={MessageSquare}
            active={view === "messages"}
            onClick={() => onViewChange("messages")}
          />
          <WorkspaceAppButton
            label="Tasks"
            icon={ListTodo}
            active={view === "tasks"}
            onClick={() => onViewChange("tasks")}
          />
          <WorkspaceAppButton
            label="Agents"
            icon={Bot}
            active={view === "agents"}
            unread={agentsNeedYou}
            unreadLabel="needs you"
            onClick={() => onViewChange("agents")}
          />
          <div className="mt-auto flex flex-col items-center gap-3">
            <WorkspaceAppButton
              label="Notifications"
              icon={Bell}
              active={view === "notifications"}
              unread={hasUnreadNotifications}
              onClick={() => onViewChange("notifications")}
            />
            <UserMenu
              name={name}
              image={image}
              showOrganizationSettings={showOrganizationSettings}
              organizationName={organizationName}
              onUserSettings={() => onViewChange("user-settings")}
              onOrganizationSettings={() => onViewChange("organization-settings")}
              signOut={signOut}
            />
          </div>
        </nav>
        <div
          ref={realtimeContainerRef}
          className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-tl-2xl bg-surface"
        >
          {loading && (
            <div className="border-b p-3">
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
          {!isAccessFailure(error) && children}
        </div>
      </TooltipProvider>
    </main>
  );
}
