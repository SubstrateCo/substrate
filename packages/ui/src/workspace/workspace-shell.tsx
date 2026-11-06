import type { ReactNode } from "react";
import { Bell, ListTodo, MessageSquare } from "lucide-react";
import { FormMessage } from "../auth/form-message";
import { Button } from "../primitives/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../primitives/tooltip";
import { UserMenu } from "./user-menu";
import { ErrorState } from "../feedback/error-state";
import { LoadingState } from "../feedback/loading-state";
import { isAccessFailure } from "../feedback/request-failure";

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
  notice,
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
  notice?: string;
  children: ReactNode;
}) {
  return (
    <main data-workspace-shell className="flex h-dvh min-h-0 overflow-hidden bg-background">
      <TooltipProvider delayDuration={350}>
        <nav
          aria-label="Apps"
          className="z-20 flex w-14 shrink-0 flex-col items-center gap-3 border-r border-rail-foreground/10 bg-rail py-3 text-rail-foreground"
        >
          {switcher}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="rail"
                size="icon-lg"
                aria-label="Messages"
                aria-current={view === "messages" ? "page" : undefined}
                onClick={() => onViewChange("messages")}
              >
                <MessageSquare className="size-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Messages</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="rail"
                size="icon-lg"
                aria-label="Tasks"
                aria-current={view === "tasks" ? "page" : undefined}
                onClick={() => onViewChange("tasks")}
              >
                <ListTodo className="size-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Tasks</TooltipContent>
          </Tooltip>
          <div className="mt-auto flex flex-col items-center gap-3">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="rail"
                  size="icon-lg"
                  className="relative"
                  aria-label={
                    hasUnreadNotifications ? "Notifications, unread notifications" : "Notifications"
                  }
                  aria-current={view === "notifications" ? "page" : undefined}
                  onClick={() => onViewChange("notifications")}
                >
                  <Bell className="size-5" />
                  {hasUnreadNotifications && (
                    <span
                      aria-hidden="true"
                      className="absolute right-2 top-2 size-2 rounded-full bg-destructive ring-2 ring-rail"
                    />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">Notifications</TooltipContent>
            </Tooltip>
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
      </TooltipProvider>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-surface">
        <FormMessage message={notice} floating />
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
    </main>
  );
}
