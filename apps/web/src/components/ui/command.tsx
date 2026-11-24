import * as React from "react";

import { Command as CommandPrimitive } from "cmdk";
import { cn } from "cn";
import { SearchIcon } from "lucide-react";

function Command({ className, ...props }: React.ComponentProps<typeof CommandPrimitive>) {
  return (
    <CommandPrimitive
      data-slot="command"
      className={cn(
        "flex min-h-0 w-full min-w-0 flex-col rounded-xl bg-popover text-popover-foreground",
        className,
      )}
      {...props}
    />
  );
}

function CommandInput({
  className,
  children,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Input> & { children?: React.ReactNode }) {
  return (
    <div
      data-slot="command-input-wrapper"
      className="flex h-10 min-w-0 shrink-0 items-center gap-2 rounded-lg border border-input bg-background px-3 focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/20"
    >
      <SearchIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <CommandPrimitive.Input
        data-slot="command-input"
        className={cn(
          "h-full w-full min-w-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        {...props}
      />
      {children}
    </div>
  );
}

function CommandList({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.List>) {
  return (
    <CommandPrimitive.List
      data-slot="command-list"
      className={cn(
        "no-scrollbar max-h-72 min-h-0 scroll-py-1 overflow-x-hidden overflow-y-auto overscroll-contain outline-none",
        className,
      )}
      {...props}
    />
  );
}

function CommandEmpty({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Empty>) {
  return (
    <CommandPrimitive.Empty
      data-slot="command-empty"
      className={cn("px-2 py-8 text-center text-sm wrap-anywhere text-muted-foreground", className)}
      {...props}
    />
  );
}

function CommandGroup({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Group>) {
  return (
    <CommandPrimitive.Group
      data-slot="command-group"
      className={cn(
        "overflow-hidden p-1 text-foreground **:[[cmdk-group-heading]]:px-2 **:[[cmdk-group-heading]]:py-2 **:[[cmdk-group-heading]]:text-xs **:[[cmdk-group-heading]]:font-medium **:[[cmdk-group-heading]]:text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

function CommandItem({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.Item>) {
  return (
    <CommandPrimitive.Item
      data-slot="command-item"
      className={cn(
        "group/command-item relative flex min-w-0 cursor-default items-center gap-2 rounded-lg px-2 py-1.5 text-sm wrap-anywhere outline-none select-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 data-[selected=true]:bg-row-highlight [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    />
  );
}

function CommandShortcut({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="command-shortcut"
      className={cn("ml-auto shrink-0 text-xs text-muted-foreground", className)}
      {...props}
    />
  );
}

export {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
};
