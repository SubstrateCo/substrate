import * as React from "react";

import { Button } from "@/components/ui/button";
import { ComboboxPortalContainer, isComboboxEscape } from "@/components/ui/combobox";
import { cn } from "cn";
import { XIcon } from "lucide-react";
import { Dialog } from "radix-ui";

function Sheet({ ...props }: React.ComponentProps<typeof Dialog.Root>) {
  return <Dialog.Root data-slot="sheet" {...props} />;
}

function SheetTrigger({ ...props }: React.ComponentProps<typeof Dialog.Trigger>) {
  return <Dialog.Trigger data-slot="sheet-trigger" {...props} />;
}

function SheetClose({ ...props }: React.ComponentProps<typeof Dialog.Close>) {
  return <Dialog.Close data-slot="sheet-close" {...props} />;
}

function SheetPortal({ ...props }: React.ComponentProps<typeof Dialog.Portal>) {
  return <Dialog.Portal data-slot="sheet-portal" {...props} />;
}

function SheetOverlay({ className, ...props }: React.ComponentProps<typeof Dialog.Overlay>) {
  return (
    <Dialog.Overlay
      data-slot="sheet-overlay"
      className={cn(
        "fixed inset-0 z-10 bg-black/40 duration-200 ease-drawer motion-reduce:animate-none! data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:duration-150 data-closed:fade-out-0",
        className,
      )}
      {...props}
    />
  );
}

function SheetContent({
  className,
  children,
  side = "right",
  showCloseButton = true,
  container,
  onEscapeKeyDown,
  ...props
}: React.ComponentProps<typeof Dialog.Content> & {
  side?: "top" | "right" | "bottom" | "left";
  showCloseButton?: boolean;
  container?: React.ComponentProps<typeof Dialog.Portal>["container"];
}) {
  const [popupContainer, setPopupContainer] = React.useState<HTMLDivElement | null>(null);
  return (
    <SheetPortal container={container}>
      <SheetOverlay className="pointer-events-auto absolute" />
      <Dialog.Content
        data-slot="sheet-content"
        data-side={side}
        onEscapeKeyDown={(event) => {
          if (isComboboxEscape(event)) event.preventDefault();
          else onEscapeKeyDown?.(event);
        }}
        className={cn(
          "pointer-events-auto absolute z-20 flex flex-col overflow-hidden bg-surface text-sm text-foreground shadow-floating duration-200 ease-drawer outline-none data-[side=bottom]:inset-x-0 data-[side=bottom]:bottom-0 data-[side=bottom]:border-t data-[side=left]:inset-y-0 data-[side=left]:left-0 data-[side=left]:border-r data-[side=right]:inset-y-0 data-[side=right]:right-0 data-[side=right]:border-l data-[side=top]:inset-x-0 data-[side=top]:top-0 data-[side=top]:border-b motion-reduce:animate-none! data-open:animate-in data-open:fade-in-0 data-[side=bottom]:data-open:slide-in-from-bottom-full data-[side=left]:data-open:slide-in-from-left-full data-[side=right]:data-open:slide-in-from-right-full data-[side=top]:data-open:slide-in-from-top-full data-closed:animate-out data-closed:duration-150 data-closed:fade-out-0 data-[side=bottom]:data-closed:slide-out-to-bottom-full data-[side=left]:data-closed:slide-out-to-left-full data-[side=right]:data-closed:slide-out-to-right-full data-[side=top]:data-closed:slide-out-to-top-full",
          className,
        )}
        {...props}
      >
        <ComboboxPortalContainer value={popupContainer}>{children}</ComboboxPortalContainer>
        <div ref={setPopupContainer} data-slot="sheet-popups" className="contents" />
        {showCloseButton && (
          <Dialog.Close data-slot="sheet-close" asChild>
            <Button variant="ghost" className="absolute top-3 right-3" size="icon-sm">
              <XIcon />
              <span className="sr-only">Close</span>
            </Button>
          </Dialog.Close>
        )}
      </Dialog.Content>
    </SheetPortal>
  );
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-header"
      className={cn("flex flex-col gap-0.5 p-4", className)}
      {...props}
    />
  );
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn("mt-auto flex flex-col gap-2 p-4", className)}
      {...props}
    />
  );
}

function SheetTitle({ className, ...props }: React.ComponentProps<typeof Dialog.Title>) {
  return (
    <Dialog.Title
      data-slot="sheet-title"
      className={cn("font-heading text-base font-medium text-foreground", className)}
      {...props}
    />
  );
}

function SheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof Dialog.Description>) {
  return (
    <Dialog.Description
      data-slot="sheet-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
};
