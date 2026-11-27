import type { ReactNode } from "react";

import { PageHeader } from "@/components/layout/page-header";
import { cn } from "cn";

/**
 * The one content column of every settings surface (account, organization, project, agent): at
 * most `max-w-4xl`, centered within the page inset, `space-y-6`. It is also the `content`
 * container, so cards can switch to two columns by their own width. Pass `inset` when the parent
 * does not already provide the page's `p-6`, such as a tab panel.
 */
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
  // The inset wraps the column, so the column is as wide in a tab panel as beside a sidebar.
  return inset ? <div className="min-w-0 p-4 sm:p-6">{column}</div> : column;
}

/** One settings section: a page header, then its cards and lists. */
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

export function SettingsGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-w-0 grid-cols-1 items-start gap-6 @4xl/content:grid-cols-2">
      {children}
    </div>
  );
}
