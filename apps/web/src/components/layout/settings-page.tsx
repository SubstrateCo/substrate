import type { ReactNode } from "react";

import { PageHeader } from "@/components/layout/page-header";
import { PageContent, PageLayout } from "@/components/layout/page-layout";
import { cn } from "cn";

/**
 * The frame of a settings area: a section sidebar on the left and the open section on the right.
 * Put a `SettingsPanel` in `children` for the open section.
 */
export function SettingsPage({
  id,
  label,
  sidebar,
  children,
}: {
  id: string;
  label: string;
  /** A `PageSidebar` with the section links. */
  sidebar: ReactNode;
  children?: ReactNode;
}) {
  return (
    <PageLayout id={id} aria-label={label}>
      {sidebar}
      <PageContent className="overflow-y-auto p-6">{children}</PageContent>
    </PageLayout>
  );
}

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
      className={cn("@container/content mx-auto w-full max-w-4xl min-w-0 space-y-6", className)}
    >
      {children}
    </div>
  );
  // The inset wraps the column, so the column is as wide in a tab panel as beside a sidebar.
  return inset ? <div className="p-6">{column}</div> : column;
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
