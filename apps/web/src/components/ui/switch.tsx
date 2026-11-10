import * as React from "react";

import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";
import { Switch as SwitchPrimitive } from "radix-ui";

const switchVariants = cva(
  "peer group/switch relative inline-flex shrink-0 items-center rounded-full border border-transparent transition-colors duration-150 outline-none group-has-focus-visible/field-label:border-transparent group-has-focus-visible/field-label:ring-0 after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive focus-visible:aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive dark:focus-visible:aria-invalid:ring-destructive/40 data-checked:bg-primary data-unchecked:bg-input dark:data-unchecked:bg-input/80 data-disabled:cursor-not-allowed data-disabled:opacity-50",
  {
    variants: {
      size: {
        default: "h-5 w-9",
        sm: "h-3.5 w-6",
        appearance: "h-7 w-12",
      },
    },
    defaultVariants: { size: "default" },
  },
);

const switchThumbVariants = cva(
  "pointer-events-none relative block rounded-full bg-background ring-0 transition-transform duration-200 motion-reduce:transition-none dark:data-checked:bg-primary-foreground data-unchecked:translate-x-0 dark:data-unchecked:bg-foreground",
  {
    variants: {
      size: {
        default: "size-4 data-checked:translate-x-4.5",
        sm: "size-3 data-checked:translate-x-2.5",
        appearance: "size-6 data-checked:translate-x-5.5",
      },
    },
    defaultVariants: { size: "default" },
  },
);

function Switch({
  className,
  size = "default",
  children,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root> & VariantProps<typeof switchVariants>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      className={cn(switchVariants({ size }), className)}
      {...props}
    >
      <SwitchPrimitive.Thumb data-slot="switch-thumb" className={switchThumbVariants({ size })}>
        {children}
      </SwitchPrimitive.Thumb>
    </SwitchPrimitive.Root>
  );
}

export { Switch };
