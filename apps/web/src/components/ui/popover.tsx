import * as React from "react";

import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";
import { Popover as PopoverPrimitive } from "radix-ui";

const popoverVariants = cva(
  "z-50 flex origin-(--radix-popover-content-transform-origin) flex-col rounded-lg bg-popover text-sm text-popover-foreground shadow-floating ring-1 ring-foreground/10 outline-hidden duration-150 ease-out data-open:animate-in data-open:fade-in-0 data-open:zoom-in-97 data-closed:animate-out data-closed:duration-100 data-closed:fade-out-0 data-closed:zoom-out-97",
  {
    variants: {
      variant: {
        default: "w-72 gap-2.5 p-2.5",
        menu: "w-64 max-w-(--radix-popover-content-available-width) gap-1 p-1",
        reference:
          "w-104 max-w-(--radix-popover-content-available-width) gap-0 overflow-hidden p-0 motion-reduce:animate-none",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

function Popover({ ...props }: React.ComponentProps<typeof PopoverPrimitive.Root>) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />;
}

function PopoverTrigger({ ...props }: React.ComponentProps<typeof PopoverPrimitive.Trigger>) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />;
}

function PopoverContent({
  className,
  align = "center",
  sideOffset = 4,
  variant,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content> & VariantProps<typeof popoverVariants>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        data-slot="popover-content"
        align={align}
        sideOffset={sideOffset}
        className={cn(popoverVariants({ variant }), className)}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}

function PopoverAnchor({ ...props }: React.ComponentProps<typeof PopoverPrimitive.Anchor>) {
  return <PopoverPrimitive.Anchor data-slot="popover-anchor" {...props} />;
}

export { Popover, PopoverAnchor, PopoverContent, PopoverTrigger };
