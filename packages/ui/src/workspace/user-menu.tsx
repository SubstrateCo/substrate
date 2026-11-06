import { useState, type ReactNode } from "react";
import { Building2, Settings } from "lucide-react";
import { Button } from "../primitives/button";
import { Popover, PopoverContent, PopoverTrigger } from "../primitives/popover";
import { AppearanceControl } from "../theme/appearance-control";
import { PicturePreview } from "../upload/picture-preview";

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
  const [openedBy, setOpenedBy] = useState<"hover" | "click" | null>(null);
  return (
    <Popover open={openedBy !== null} onOpenChange={(open) => setOpenedBy(open ? "click" : null)}>
      <PopoverTrigger asChild>
        <Button
          variant="avatar"
          size="icon"
          className="overflow-hidden"
          aria-label={`Signed in as ${name}`}
          title={name}
          onPointerEnter={(event) => {
            if (event.pointerType === "mouse") setOpenedBy((current) => current ?? "hover");
          }}
          onClick={(event) => {
            event.preventDefault();
            setOpenedBy("click");
          }}
        >
          <PicturePreview
            src={image}
            fallback={name.slice(0, 2).toUpperCase()}
            className="size-full object-cover"
          />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        aria-label="User actions"
        side="right"
        align="end"
        sideOffset={12}
        className="w-64"
        onOpenAutoFocus={(event) => {
          if (openedBy === "hover") event.preventDefault();
        }}
      >
        <p className="px-2 py-1 text-xs font-medium text-muted-foreground">User</p>
        <AppearanceControl />
        <Button
          variant="ghost"
          className="w-full justify-start"
          onClick={() => {
            setOpenedBy(null);
            onUserSettings();
          }}
        >
          <Settings />
          User settings
        </Button>
        {showOrganizationSettings && (
          <div className="mt-2 border-t pt-2">
            <p className="px-2 py-1 text-xs font-medium text-muted-foreground">
              Organization{organizationName ? ` · ${organizationName}` : ""}
            </p>
            <Button
              variant="ghost"
              className="w-full justify-start"
              onClick={() => {
                setOpenedBy(null);
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
