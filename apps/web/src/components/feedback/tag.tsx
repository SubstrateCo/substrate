import type { ReactNode } from "react";

import { toneBorder, toneFill } from "./tag-styles";
import { cva } from "class-variance-authority";
import { cn } from "cn";

export type TagTone = "default" | "working" | "success" | "warning" | "destructive";

const tagVariants = cva(
  "inline-flex max-w-full items-center gap-1 rounded-md border px-1.5 text-xs",
  {
    variants: {
      tone: {
        default: "text-muted-foreground",
        working: "text-foreground",
        success: "text-success",
        warning: cn(toneBorder.warning, toneFill.warning, "text-warning-text"),
        destructive: cn(toneBorder.destructive, toneFill.destructive, "text-destructive"),
      },
      size: { default: "py-0.5", sm: "py-0" },
    },
    defaultVariants: { tone: "default", size: "default" },
  },
);

function WorkingDot() {
  return (
    <span aria-hidden="true" className="grid size-3 shrink-0 place-items-center">
      <span className="size-1.5 rounded-full bg-primary motion-safe:animate-pulse" />
    </span>
  );
}

export function Tag({
  tone = "default",
  icon,
  size = "default",
  className,
  children,
}: {
  tone?: TagTone;
  icon?: ReactNode;
  size?: "default" | "sm";
  className?: string;
  children: ReactNode;
}) {
  return (
    <span className={cn(tagVariants({ tone, size }), className)}>
      {icon ?? (tone === "working" && <WorkingDot />)}
      {children}
    </span>
  );
}
