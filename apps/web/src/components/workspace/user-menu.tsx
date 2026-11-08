import { useState, type ReactNode } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { Button } from "../ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Separator } from "../ui/separator";
import { UserMenuTheme } from "./user-menu/user-menu-theme";
import { Building2, Settings } from "lucide-react";

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
      <AvatarFallback>{name.slice(0, 2).toUpperCase()}</AvatarFallback>
    </Avatar>
  );
  const go = (action: () => void) => () => {
    setOpen(false);
    action();
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="avatar"
          size="icon"
          className="overflow-hidden"
          aria-label={`Signed in as ${name}`}
          title={name}
        >
          {avatar}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        aria-label="User actions"
        side="right"
        align="end"
        sideOffset={12}
        variant="menu"
      >
        <div className="flex min-w-0 items-center gap-2.5 p-2">
          <div className="size-8 shrink-0 overflow-hidden rounded-md">{avatar}</div>
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
        <UserMenuTheme />
        <Separator />
        <div className="[&_button]:w-full [&_button]:justify-start [&_svg]:text-muted-foreground">
          {signOut}
        </div>
      </PopoverContent>
    </Popover>
  );
}
