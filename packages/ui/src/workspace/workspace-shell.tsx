import type { ReactNode } from "react";
import { MessageSquare, Settings } from "lucide-react";
import { FormMessage } from "../auth/form-message";
import { Button } from "../primitives/button";

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
    <main className="flex h-dvh min-h-0 overflow-hidden bg-background">
      <nav
        aria-label="Apps"
        className="flex w-16 shrink-0 flex-col items-center gap-5 bg-[#191b24] py-5 text-white"
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
              ? "bg-white/15 text-white hover:bg-white/20 hover:text-white"
              : "text-white/60 hover:bg-white/10 hover:text-white"
          }
          onClick={() => onViewChange("messages")}
        >
          <MessageSquare className="size-5" />
        </Button>
        <div className="mt-auto flex flex-col items-center gap-4">
          {showSettings && (
            <Button
              variant="ghost"
              size="icon-lg"
              aria-label="Settings"
              title="Settings"
              aria-current={view === "settings" ? "page" : undefined}
              className="text-white/60 hover:bg-white/10 hover:text-white"
              onClick={() => onViewChange("settings")}
            >
              <Settings className="size-5" />
            </Button>
          )}
          <div
            title={name}
            aria-label={`Signed in as ${name}`}
            className="flex size-8 items-center justify-center rounded-lg bg-indigo-300 text-xs font-semibold text-indigo-950"
          >
            {name.slice(0, 2).toUpperCase()}
          </div>
          {signOut}
        </div>
      </nav>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {error && (
          <div className="p-3">
            <FormMessage error={error} />
          </div>
        )}
        {children}
      </div>
    </main>
  );
}
