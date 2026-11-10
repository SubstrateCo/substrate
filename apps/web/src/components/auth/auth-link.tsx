import type { ComponentProps } from "react";

import { Button } from "../ui/button";
import { cn } from "cn";

/** Inline text link for guest and setup pages: quiet at rest, underlined on hover. */
export function AuthLink({ className, ...props }: ComponentProps<"a">) {
  return (
    <a
      className={cn(
        "rounded-sm font-medium text-foreground underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/50",
        className,
      )}
      {...props}
    />
  );
}

/**
 * Secondary navigation on guest and setup pages, such as "Workspaces". Use it in
 * `AuthFrame` actions, which mute it beside Sign out.
 */
export function AuthNavLink(props: ComponentProps<"a">) {
  return (
    <Button asChild variant="ghost">
      <a {...props} />
    </Button>
  );
}
