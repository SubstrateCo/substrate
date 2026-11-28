import type { ComponentProps } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "cn";

export function AuthLinkAnchor({ className, ...props }: ComponentProps<"a">) {
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

export function AuthNavLinkAnchor(props: ComponentProps<"a">) {
  return (
    <Button asChild variant="ghost">
      <a {...props} />
    </Button>
  );
}
