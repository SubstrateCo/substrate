import * as React from "react";

import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";

const textareaVariants = cva(
  "flex field-sizing-content min-h-16 w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-base transition-[border-color,box-shadow] duration-150 ease-linear outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
  {
    variants: {
      variant: {
        default: "",
        surface: "border-border bg-surface dark:bg-surface",
        composer:
          "rounded-none border-0 bg-transparent px-3 shadow-none focus-visible:ring-0 dark:bg-transparent",
        "task-title":
          "border-transparent bg-transparent px-0 py-1 text-lg font-semibold tracking-tight shadow-none md:text-lg dark:bg-transparent",
        "task-description":
          "border-transparent bg-transparent px-0 text-xs shadow-none md:text-xs dark:bg-transparent",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function Textarea({
  className,
  variant,
  ...props
}: React.ComponentProps<"textarea"> & VariantProps<typeof textareaVariants>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(textareaVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Textarea };
