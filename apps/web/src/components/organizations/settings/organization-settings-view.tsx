import type { ReactNode } from "react";

import { PageContent, PageLayout } from "@/components/layout/page-layout";

export function SettingsPage({
  id,
  children,
  title = "Organization settings",
}: {
  id: string;
  children?: ReactNode;
  title?: string;
}) {
  return (
    <PageLayout id={id} aria-label={title}>
      <PageContent className="overflow-y-auto p-4 sm:p-10">
        <div className="mx-auto w-full max-w-3xl space-y-8">
          <header className="space-y-2">
            <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
              Settings
            </p>
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          </header>
          {children}
        </div>
      </PageContent>
    </PageLayout>
  );
}
