import * as React from "react";

import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";
import { Avatar as AvatarPrimitive } from "radix-ui";

const avatarVariants = cva(
  "group/avatar relative flex size-8 shrink-0 rounded-full select-none after:absolute after:inset-0 after:rounded-full after:border after:border-border after:mix-blend-darken data-[size=lg]:size-10 data-[size=sm]:size-6 dark:after:mix-blend-lighten",
  {
    variants: {
      variant: {
        default: "",
        user: "rounded-md *:rounded-md after:hidden *:data-[slot=avatar-fallback]:bg-accent *:data-[slot=avatar-fallback]:text-xs *:data-[slot=avatar-fallback]:font-semibold *:data-[slot=avatar-fallback]:text-accent-foreground",
        catalog: "after:hidden *:data-[slot=avatar-fallback]:text-foreground",
        editor:
          "rounded-xl border border-primary/15 *:rounded-xl after:hidden *:data-[slot=avatar-fallback]:bg-accent *:data-[slot=avatar-fallback]:text-xl *:data-[slot=avatar-fallback]:font-medium *:data-[slot=avatar-fallback]:text-primary",
        message:
          "rounded-lg border border-primary/10 shadow-surface *:rounded-lg after:hidden *:data-[slot=avatar-fallback]:bg-accent *:data-[slot=avatar-fallback]:font-semibold *:data-[slot=avatar-fallback]:text-accent-foreground",
        picture: "overflow-hidden border border-border bg-muted after:hidden",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

function Avatar({
  className,
  size = "default",
  variant = "default",
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Root> & {
  size?: "default" | "sm" | "lg";
} & VariantProps<typeof avatarVariants>) {
  return (
    <AvatarPrimitive.Root
      data-slot="avatar"
      data-size={size}
      data-variant={variant}
      className={cn(avatarVariants({ variant, className }))}
      {...props}
    />
  );
}

function AvatarImage({ className, ...props }: React.ComponentProps<typeof AvatarPrimitive.Image>) {
  return (
    <AvatarPrimitive.Image
      data-slot="avatar-image"
      className={cn("aspect-square size-full rounded-full object-cover", className)}
      {...props}
    />
  );
}

function AvatarFallback({
  className,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Fallback>) {
  return (
    <AvatarPrimitive.Fallback
      data-slot="avatar-fallback"
      className={cn(
        "flex size-full items-center justify-center rounded-full bg-muted text-sm text-muted-foreground group-data-[size=sm]/avatar:text-xs",
        className,
      )}
      {...props}
    />
  );
}

function AvatarBadge({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="avatar-badge"
      className={cn(
        "absolute right-0 bottom-0 z-10 inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground bg-blend-color ring-2 ring-background select-none",
        "group-data-[size=sm]/avatar:size-2 group-data-[size=sm]/avatar:[&>svg]:hidden",
        "group-data-[size=default]/avatar:size-2.5 group-data-[size=default]/avatar:[&>svg]:size-2",
        "group-data-[size=lg]/avatar:size-3 group-data-[size=lg]/avatar:[&>svg]:size-2",
        className,
      )}
      {...props}
    />
  );
}

export { Avatar, AvatarImage, AvatarFallback, AvatarBadge };
