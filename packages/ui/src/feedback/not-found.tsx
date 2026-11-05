import type { ReactNode } from "react";

export function NotFound({ homeLink }: { homeLink: ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <div className="w-full max-w-md space-y-4 rounded-2xl border bg-card p-8 shadow-raised">
        <p className="text-xs font-semibold tracking-widest text-primary">404 / NOT FOUND</p>
        <h1 className="text-2xl font-semibold tracking-tight">Page not found</h1>
        <p className="text-sm text-muted-foreground">
          This page may have moved, or you may have the wrong link.
        </p>
        <div className="text-sm font-medium text-primary underline underline-offset-4">
          {homeLink}
        </div>
      </div>
    </main>
  );
}
