import type { ReactNode } from "react";

import { ErrorState } from "../feedback/error-state";
import { LoadingState } from "../feedback/loading-state";
import { isAccessFailure } from "../feedback/request-failure";
import { TooltipProvider } from "../ui/tooltip";
import { UserMenu } from "./user-menu";
import { WorkspaceAppButton } from "@/components/workspace/workspace-shell/workspace-app-button";
import { Bell, ListTodo, MessageSquare } from "lucide-react";

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
}: {
  name: string;
  image?: string | null;
  view: "messages" | "tasks" | "notifications" | "user-settings" | "organization-settings";
  onViewChange: (
    view: "messages" | "tasks" | "notifications" | "user-settings" | "organization-settings",
  ) => void;
  hasUnreadNotifications?: boolean;
  showOrganizationSettings: boolean;
  organizationName?: string;
  switcher: ReactNode;
  signOut: ReactNode;
  error?: Error | null;
  loading?: boolean;
  onRetry?: () => void;
  children: ReactNode;
}) {
  return (
    <main
      data-workspace-shell
      className="flex h-(--app-height) min-h-0 overflow-hidden bg-background"
    >
      <TooltipProvider delayDuration={350}>
        <nav
          aria-label="Apps"
          className="z-20 flex w-14 shrink-0 flex-col items-center gap-3 border-r border-rail-foreground/10 bg-rail py-3 text-rail-foreground"
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
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-surface">
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
