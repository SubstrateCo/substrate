import type { ReactNode } from "react";

export function SettingsPage({
  children,
  title = "Organization settings",
}: {
  children?: ReactNode;
  title?: string;
}) {
  return (
    <section className="min-w-0 flex-1 overflow-y-auto p-4 sm:p-10">
      <div className="mx-auto max-w-3xl space-y-8">
        <header className="space-y-2">
          <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
            Settings
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        </header>
        {children}
      </div>
    </section>
  );
}
