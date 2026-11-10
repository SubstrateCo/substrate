import type { ReactNode } from "react";

import { PageHeader } from "@/components/layout/page-header";
import { PageContent, PageLayout } from "@/components/layout/page-layout";

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
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <PageHeader title={title} description={description} actions={actions} />
      {children}
    </div>
  );
}
