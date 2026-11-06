import type { ReactNode } from "react";

import { useHydrated } from "../hooks/use-hydrated";
import { Card, CardContent, CardDescription, CardHeader } from "../primitives/card";

export function AuthFrame({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  const hydrated = useHydrated();
  return (
    <main className="fixed inset-0 flex items-start justify-center bg-radial from-accent to-transparent px-4 py-auth-block sm:px-6">
      <Card className="max-h-full min-h-0 w-full max-w-md overflow-y-auto">
        <CardHeader>
          <p className="mb-5 flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground">
            <span aria-hidden="true" className="size-3 rounded-sm bg-primary shadow-surface" />
            Startup OS
          </p>
          <h1 className="font-heading text-2xl leading-snug font-medium tracking-tight">{title}</h1>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          <fieldset disabled={!hydrated} className="min-w-0 space-y-5">
            {children}
          </fieldset>
        </CardContent>
      </Card>
    </main>
  );
}
