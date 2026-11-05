import type { ReactNode } from "react";

export function WorkspaceSettings({ children }: { children?: ReactNode }) {
  return (
    <section className="min-w-0 flex-1 overflow-y-auto p-6 sm:p-10">
      <div className="mx-auto max-w-3xl space-y-8">
        <header className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Workspace
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        </header>
        {children}
      </div>
    </section>
  );
}
