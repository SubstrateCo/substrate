import type { ReactNode } from "react";

export function NotFound({ homeLink }: { homeLink: ReactNode }) {
  return (
    <main className="mx-auto max-w-lg space-y-4 p-8">
      <h1 className="text-2xl font-semibold">Page not found</h1>
      {homeLink}
    </main>
  );
}
