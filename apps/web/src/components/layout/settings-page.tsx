import type { ReactNode } from "react";

import { PageHeader } from "@/components/layout/page-header";
import { cn } from "cn";

export function SettingsContent({
  inset = false,
  className,
  children,
}: {
  inset?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  const column = (
    <div
      data-slot="settings-content"
      className={cn(
        "@container/content mx-auto w-full max-w-4xl min-w-0 space-y-4 sm:space-y-6",
        className,
      )}
    >
      {children}
    </div>
  );
  return inset ? <div className="min-w-0 p-4 sm:p-6">{column}</div> : column;
}

export function SettingsPanel({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <SettingsContent>
      <PageHeader title={title} description={description} actions={actions} />
      {children}
    </SettingsContent>
  );
}
