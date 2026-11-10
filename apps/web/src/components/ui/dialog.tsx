import * as React from "react";

import { Button } from "@/components/ui/button";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";
import { XIcon } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";

function Dialog({ ...props }: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

function DialogTrigger({ ...props }: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

function DialogPortal({ ...props }: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

function DialogClose({ ...props }: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 isolate z-50 bg-black/40 duration-200 ease-out data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:duration-150 data-closed:fade-out-0",
        className,
      )}
      {...props}
    />
  );
}

// A column: DialogHeader and DialogFooter stay fixed and DialogBody scrolls between them.
// A form that is a direct child does not take part in the layout, so its body and footer do.
const dialogContentVariants = cva(
  "fixed top-1/2 left-1/2 z-50 flex max-h-overlay-height w-overlay-width -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border bg-popover text-sm text-popover-foreground shadow-floating duration-200 ease-out outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-97 data-closed:animate-out data-closed:duration-150 data-closed:fade-out-0 data-closed:zoom-out-97 [&>form]:contents",
  {
    variants: {
      size: {
        default: "max-w-lg",
        lg: "max-w-2xl",
      },
    },
    defaultVariants: { size: "default" },
  },
);

function DialogContent({
  className,
  children,
  size,
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> &
  VariantProps<typeof dialogContentVariants> & {
    showCloseButton?: boolean;
  }) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(dialogContentVariants({ size }), className)}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close data-slot="dialog-close" asChild>
            <Button variant="ghost" className="absolute top-4 right-4" size="icon-sm">
              <XIcon />
              <span className="sr-only">Close</span>
            </Button>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex shrink-0 flex-col gap-1.5 px-5 pt-5 pb-4", className)}
      {...props}
    />
  );
}

/** The only part of a dialog that scrolls. */
function DialogBody({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-body"
      className={cn("grid min-h-0 flex-1 content-start gap-4 overflow-y-auto px-5 pb-5", className)}
      {...props}
    />
  );
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean;
}) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "flex shrink-0 flex-col-reverse gap-2 border-t bg-muted/50 px-5 py-3 sm:flex-row sm:items-center sm:justify-end",
        className,
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close asChild>
          <Button variant="outline">Close</Button>
        </DialogPrimitive.Close>
      )}
    </div>
  );
}

function DialogTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("pr-8 font-heading text-base leading-snug font-semibold", className)}
      {...props}
    />
  );
}

const dialogDescriptionVariants = cva(
  "text-sm text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
  {
    variants: {
      variant: {
        default: "",
        context: "line-clamp-2 wrap-anywhere",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

function DialogDescription({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description> &
  VariantProps<typeof dialogDescriptionVariants>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(dialogDescriptionVariants({ variant }), className)}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
};
