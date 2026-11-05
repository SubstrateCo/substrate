import type { ReactNode } from "react";
import { MessageSquare } from "lucide-react";
import { FormMessage } from "../auth/form-message";
import { Button } from "../primitives/button";
import { UserMenu } from "./user-menu";
import { ErrorState } from "../feedback/error-state";
import { LoadingState } from "../feedback/loading-state";
import { isAccessFailure } from "../feedback/request-failure";

export function WorkspaceShell({
  name,
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
}: {
  name: string;
  view: "messages" | "user-settings" | "organization-settings";
  onViewChange: (view: "messages" | "user-settings" | "organization-settings") => void;
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
      <nav
        aria-label="Apps"
        className="z-20 flex w-14 shrink-0 flex-col items-center gap-5 border-r border-rail-foreground/10 bg-rail py-5 text-rail-foreground sm:w-16"
      >
        {switcher}
        <Button
          variant="rail"
          size="icon-lg"
          aria-label="Messages"
          title="Messages"
          aria-current={view === "messages" ? "page" : undefined}
          onClick={() => onViewChange("messages")}
        >
          <MessageSquare className="size-5" />
        </Button>
        <div className="mt-auto">
          <UserMenu
            name={name}
            showOrganizationSettings={showOrganizationSettings}
            organizationName={organizationName}
            onUserSettings={() => onViewChange("user-settings")}
            onOrganizationSettings={() => onViewChange("organization-settings")}
            signOut={signOut}
          />
        </div>
      </nav>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-surface md:m-2 md:rounded-xl md:border md:shadow-raised">
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
