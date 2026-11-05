import { useEffect, useState, type ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../primitives/card";

export function AuthFrame({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  return (
    <main className="flex min-h-dvh items-center justify-center bg-radial from-accent to-transparent px-4 py-20 sm:px-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <p className="mb-5 flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground">
            <span aria-hidden="true" className="size-3 rounded-sm bg-primary shadow-surface" />
            Startup OS
          </p>
          <CardTitle size="xl">{title}</CardTitle>
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
