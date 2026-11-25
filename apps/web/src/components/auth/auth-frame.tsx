import type { ReactNode } from "react";

import { BrandMark } from "./brand-mark";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Heading } from "@/components/ui/heading";
import { cn } from "cn";

/**
 * The one frame for signed-out and pre-workspace pages: same background, brand, and top offset.
 * The card is anchored near the top so it grows downward when errors appear instead of
 * re-centering. `actions` sit on the brand row (Workspaces, Sign out); `footer` sits under
 * the card (Already have an account?).
 */
export function AuthFrame({
  title,
  description,
  actions,
  footer,
  size = "default",
  children,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  footer?: ReactNode;
  size?: "default" | "wide";
  children?: ReactNode;
}) {
  return (
    <main className="fixed inset-0 overflow-y-auto bg-background [&_[data-slot=button][data-size=lg]]:min-h-11 sm:[&_[data-slot=button][data-size=lg]]:min-h-9 [&_[data-slot=input]]:h-11 sm:[&_[data-slot=input]]:h-8">
      <div
        className={cn(
          "mx-auto w-full px-4 pt-16 pb-12 sm:px-6 sm:pt-24",
          size === "wide" ? "max-w-2xl" : "max-w-md",
        )}
      >
        <div className="mb-5 flex min-h-8 flex-wrap items-center justify-between gap-2">
          <BrandMark className="shrink-0" />
          {actions && (
            <nav
              aria-label="Account"
              className="ml-auto flex max-w-full shrink-0 flex-wrap items-center justify-end gap-1 whitespace-nowrap *:text-muted-foreground *:hover:text-foreground"
            >
              {actions}
            </nav>
          )}
        </div>
        <Card>
          <CardHeader className="px-4 sm:px-6">
            <Heading level={1} variant="page">
              {title}
            </Heading>
            {description && <CardDescription>{description}</CardDescription>}
          </CardHeader>
          {children && (
            <CardContent className="px-4 sm:px-6">
              <div className="min-w-0 space-y-5">{children}</div>
            </CardContent>
          )}
        </Card>
        {footer && (
          <div className="mt-5 flex flex-wrap items-center justify-center gap-x-1 text-sm text-muted-foreground">
            {footer}
          </div>
        )}
      </div>
    </main>
  );
}
