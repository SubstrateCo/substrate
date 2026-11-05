import type { ReactNode } from "react";
import { MessageSquare } from "lucide-react";
import { FormMessage } from "../auth/form-message";
import { Button } from "../primitives/button";
import { UserMenu } from "./user-menu";

export function WorkspaceShell({
  name,
  view,
  onViewChange,
  showSettings,
  switcher,
  signOut,
  error,
  children,
}: {
  name: string;
  view: "messages" | "settings";
  onViewChange: (view: "messages" | "settings") => void;
  showSettings: boolean;
  switcher: ReactNode;
  signOut: ReactNode;
  error?: Error | null;
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
            showSettings={showSettings}
            onSettings={() => onViewChange("settings")}
            signOut={signOut}
          />
        </div>
      </nav>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-surface md:m-2 md:rounded-xl md:border md:shadow-raised">
        <FormMessage error={error} floating />
        {children}
      </div>
    </main>
  );
}
