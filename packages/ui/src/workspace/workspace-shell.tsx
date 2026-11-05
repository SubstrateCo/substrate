import type { ReactNode } from "react";
import { MessageSquare, Settings } from "lucide-react";
import { FormMessage } from "../auth/form-message";
import { Button } from "../primitives/button";
import { ThemeSwitcher } from "../theme/theme-switcher";

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
          variant="ghost"
          size="icon-lg"
          aria-label="Messages"
          title="Messages"
          aria-current={view === "messages" ? "page" : undefined}
          className={
            view === "messages"
              ? "bg-rail-foreground/15 text-rail-foreground shadow-surface hover:bg-rail-foreground/20 hover:text-rail-foreground"
              : "text-rail-foreground/60 hover:bg-rail-foreground/10 hover:text-rail-foreground"
          }
          onClick={() => onViewChange("messages")}
        >
          <MessageSquare className="size-5" />
        </Button>
        <div className="mt-auto flex flex-col items-center gap-4">
          <ThemeSwitcher compact />
          {showSettings && (
            <Button
              variant="ghost"
              size="icon-lg"
              aria-label="Settings"
              title="Settings"
              aria-current={view === "settings" ? "page" : undefined}
              className="text-rail-foreground/60 hover:bg-rail-foreground/10 hover:text-rail-foreground"
              onClick={() => onViewChange("settings")}
            >
              <Settings className="size-5" />
            </Button>
          )}
          <div
            title={name}
            aria-label={`Signed in as ${name}`}
            className="flex size-8 items-center justify-center rounded-lg bg-accent text-xs font-semibold text-accent-foreground shadow-surface"
          >
            {name.slice(0, 2).toUpperCase()}
          </div>
          {signOut}
        </div>
      </nav>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-surface md:my-2 md:mr-2 md:rounded-xl md:border md:shadow-raised">
        <FormMessage error={error} floating />
        {children}
      </div>
    </main>
  );
}
