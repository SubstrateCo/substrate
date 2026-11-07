import type { ReactNode } from "react";

import { Card, CardContent, CardDescription, CardHeader } from "../ui/card";

export function AuthFrame({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <main
      className="fixed inset-0 flex items-start justify-center bg-radial from-accent to-transparent px-4 sm:px-6"
      style={{ paddingBlock: "clamp(1rem, calc((100dvh - 36rem) / 2), 7rem)" }}
    >
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
          <div className="min-w-0 space-y-5">{children}</div>
        </CardContent>
      </Card>
    </main>
  );
}
