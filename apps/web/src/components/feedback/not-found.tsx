import type { ReactNode } from "react";

import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "../ui/empty";

export function NotFound({ homeLink }: { homeLink: ReactNode }) {
  return (
    <main className="flex min-h-(--app-height) items-center justify-center p-6">
      <Empty className="max-w-md">
        <EmptyHeader>
          <p className="text-xs font-medium text-muted-foreground">404</p>
          <EmptyTitle>
            <h1 className="text-2xl">Page not found</h1>
          </EmptyTitle>
          <EmptyDescription>
            This page may have moved, or you may have the wrong link.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <div className="text-primary underline underline-offset-4">{homeLink}</div>
        </EmptyContent>
      </Empty>
    </main>
  );
}
