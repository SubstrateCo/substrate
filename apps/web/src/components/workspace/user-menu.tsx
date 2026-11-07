import { useState, type ReactNode } from "react";

import { AppearanceControl } from "../theme/appearance-control";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { Button } from "../ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
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
          <Avatar variant="user" className="size-full">
            <AvatarImage src={image ?? undefined} alt="" />
            <AvatarFallback>{name.slice(0, 2).toUpperCase()}</AvatarFallback>
          </Avatar>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        aria-label="User actions"
        side="right"
        align="end"
        sideOffset={12}
        className="w-64"
      >
        <p className="px-2 py-1 text-xs font-medium text-muted-foreground">User</p>
        <AppearanceControl />
        <Button
          variant="ghost"
          className="w-full justify-start"
          onClick={() => {
            setOpen(false);
            onUserSettings();
          }}
        >
          <Settings />
          User settings
        </Button>
        {showOrganizationSettings && (
          <div className="mt-2 border-t pt-2">
            <p className="px-2 py-1 text-xs font-medium wrap-anywhere text-muted-foreground">
              Organization{organizationName ? ` · ${organizationName}` : ""}
            </p>
            <Button
              variant="ghost"
              className="w-full justify-start"
              onClick={() => {
                setOpen(false);
                onOrganizationSettings();
              }}
            >
              <Building2 />
              Organization settings
            </Button>
          </div>
        )}
        <div className="mt-2 border-t pt-2 [&_button]:w-full [&_button]:justify-start">
          {signOut}
        </div>
      </PopoverContent>
    </Popover>
  );
}
