import * as React from "react";

import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";
import { Avatar as AvatarPrimitive } from "radix-ui";

const avatarVariants = cva(
  "group/avatar relative flex size-8 shrink-0 rounded-full select-none after:absolute after:inset-0 after:rounded-full after:border after:border-border after:mix-blend-darken data-[size=lg]:size-10 data-[size=sm]:size-6 data-[size=xs]:size-5 dark:after:mix-blend-lighten",
  {
    variants: {
      variant: {
        default: "",
        user: "*:data-[slot=avatar-fallback]:text-xs",
        agent: "rounded-md *:rounded-md after:rounded-md",
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
  size?: "default" | "xs" | "sm" | "lg";
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
        "flex size-full items-center justify-center rounded-full bg-muted text-sm font-medium text-muted-foreground group-data-[size=sm]/avatar:text-xs group-data-[size=xs]/avatar:text-xs",
        className,
      )}
      {...props}
    />
  );
}

export { Avatar, AvatarImage, AvatarFallback };
