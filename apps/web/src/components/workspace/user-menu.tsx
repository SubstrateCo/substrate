import { Link } from "@tanstack/react-router";

import { useState, type KeyboardEvent, type ReactNode } from "react";

import { ThemeControl } from "@/components/theme/theme-control";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { useMediaQuery } from "@/hooks/use-media-query";
import { initials } from "@/lib/people/initials";
import { Building2, Settings } from "lucide-react";

function moveFocusWithArrows(event: KeyboardEvent<HTMLElement>) {
  const step = { ArrowDown: 1, ArrowUp: -1 }[event.key];
  if (!step) return;
  // A roving group (theme) exposes one stop; the rest have tabindex -1.
  const stops = [
    ...event.currentTarget.querySelectorAll<HTMLElement>("button:not([tabindex='-1']), a[href]"),
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
  signOut,
}: {
  name: string;
  image?: string | null;
  showOrganizationSettings: boolean;
  organizationName?: string;
  signOut: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const desktop = useMediaQuery("(min-width: 768px)");
  const avatar = (
    <Avatar variant="user" className="size-full">
      <AvatarImage src={image ?? undefined} alt="" />
      <AvatarFallback>{initials(name)}</AvatarFallback>
    </Avatar>
  );
  const close = () => setOpen(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="avatar"
          size="icon"
          className="cursor-pointer overflow-hidden"
          aria-label={`Signed in as ${name}`}
        >
          {avatar}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        aria-label="User actions"
        side={desktop ? "right" : "top"}
        align="end"
        sideOffset={12}
        variant="menu"
        className="max-h-(--radix-popover-content-available-height) overflow-y-auto"
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
          <Button variant="ghost" className="w-full justify-start" asChild>
            <Link to="/settings/user" onClick={close}>
              <Settings aria-hidden="true" />
              User settings
            </Link>
          </Button>
          {showOrganizationSettings && (
            <Button variant="ghost" className="w-full justify-start" asChild>
              <Link to="/settings/organization" onClick={close}>
                <Building2 aria-hidden="true" />
                Organization settings
              </Link>
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
