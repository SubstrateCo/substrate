import { useState, type KeyboardEvent, type ReactNode } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { Button } from "../ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Separator } from "../ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { ThemeControl } from "@/components/theme/theme-control";
import { initials } from "@/lib/people/initials";
import { Building2, Settings } from "lucide-react";

/** Up and Down move through the menu's actions, like a menu. The theme control keeps its own arrows. */
function moveFocusWithArrows(event: KeyboardEvent<HTMLElement>) {
  const step = { ArrowDown: 1, ArrowUp: -1 }[event.key];
  if (!step) return;
  // A roving group (theme) exposes one stop; the rest have tabindex -1.
  const stops = [
    ...event.currentTarget.querySelectorAll<HTMLElement>("button:not([tabindex='-1'])"),
  ];
  const current = stops.findIndex((stop) => stop === document.activeElement);
  event.preventDefault();
  stops[(current + step + stops.length) % stops.length]?.focus();
}

export function UserMenu({
  name,
  image,
  showOrganizationSettings,
  organizationName,
  onUserSettings,
  onOrganizationSettings,
  signOut,
}: {
  name: string;
  image?: string | null;
  showOrganizationSettings: boolean;
  organizationName?: string;
  onUserSettings: () => void;
  onOrganizationSettings: () => void;
  signOut: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const avatar = (
    <Avatar variant="user" className="size-full">
      <AvatarImage src={image ?? undefined} alt="" />
      <AvatarFallback>{initials(name)}</AvatarFallback>
    </Avatar>
  );
  const go = (action: () => void) => () => {
    setOpen(false);
    action();
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              variant="avatar"
              size="icon"
              className="overflow-hidden"
              aria-label={`Signed in as ${name}`}
            >
              {avatar}
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="right">{name}</TooltipContent>
      </Tooltip>
      <PopoverContent
        aria-label="User actions"
        side="right"
        align="end"
        sideOffset={12}
        variant="menu"
        onKeyDown={moveFocusWithArrows}
      >
        <div className="flex min-w-0 items-center gap-2.5 p-2">
          <div className="size-8 shrink-0 overflow-hidden rounded-full">{avatar}</div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{name}</p>
            {organizationName && (
              <p className="truncate text-xs text-muted-foreground">{organizationName}</p>
            )}
          </div>
        </div>
        <Separator />
        <div className="flex flex-col [&_svg]:text-muted-foreground">
          <Button variant="ghost" className="w-full justify-start" onClick={go(onUserSettings)}>
            <Settings aria-hidden="true" />
            User settings
          </Button>
          {showOrganizationSettings && (
            <Button
              variant="ghost"
              className="w-full justify-start"
              onClick={go(onOrganizationSettings)}
            >
              <Building2 aria-hidden="true" />
              Organization settings
            </Button>
          )}
        </div>
        <Separator />
        <div className="flex items-center justify-between gap-2 py-1 pr-1 pl-2">
          <span className="text-sm text-muted-foreground">Theme</span>
          <ThemeControl iconOnly />
        </div>
        <Separator />
        <div className="[&_button]:w-full [&_button]:justify-start [&_svg]:text-muted-foreground">
          {signOut}
        </div>
      </PopoverContent>
    </Popover>
  );
}
