import { createLink } from "@tanstack/react-router";

import type { ComponentProps } from "react";

import { Button } from "../ui/button";
import { cn } from "cn";

/** Inline text link for guest and setup pages: quiet at rest, underlined on hover. */
function AuthLinkAnchor({ className, ...props }: ComponentProps<"a">) {
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

export const AuthLink = createLink(AuthLinkAnchor);

/**
 * Secondary navigation on guest and setup pages, such as "Workspaces". Use it in
 * `AuthFrame` actions, which mute it beside Sign out.
 */
function AuthNavLinkAnchor(props: ComponentProps<"a">) {
  return (
    <Button asChild variant="ghost">
      <a {...props} />
    </Button>
  );
}

export const AuthNavLink = createLink(AuthNavLinkAnchor);
