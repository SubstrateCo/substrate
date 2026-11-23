import * as React from "react";

import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";
import { Label as LabelPrimitive } from "radix-ui";

const labelVariants = cva(
  "flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "",
        // A quiet label beside a compact control, such as a switch in a row.
        caption: "text-xs font-normal text-muted-foreground",
        // A whole list row that toggles its checkbox, such as a calendar in the sidebar filter.
        row: "h-8 cursor-pointer rounded-md px-2 font-normal transition-colors hover:bg-row-hover",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

function Label({
  className,
  variant,
  ...props
}: React.ComponentProps<typeof LabelPrimitive.Root> & VariantProps<typeof labelVariants>) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn(labelVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Label };
