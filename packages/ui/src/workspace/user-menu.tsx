import { useState, type ReactNode } from "react";
import { Settings } from "lucide-react";
import { Button } from "../primitives/button";
import { Popover, PopoverContent, PopoverTrigger } from "../primitives/popover";
import { AppearanceControl } from "../theme/appearance-control";

export function UserMenu({
  name,
  showSettings,
  onSettings,
  signOut,
}: {
  name: string;
  showSettings: boolean;
  onSettings: () => void;
  signOut: ReactNode;
}) {
  const [openedBy, setOpenedBy] = useState<"hover" | "click" | null>(null);
  return (
    <Popover open={openedBy !== null} onOpenChange={(open) => setOpenedBy(open ? "click" : null)}>
      <PopoverTrigger asChild>
        <Button
          variant="avatar"
          size="icon"
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
          {name.slice(0, 2).toUpperCase()}
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
        <AppearanceControl />
        {showSettings && (
          <Button
            variant="ghost"
            className="w-full justify-start"
            onClick={() => {
              setOpenedBy(null);
              onSettings();
            }}
          >
            <Settings />
            Settings
          </Button>
        )}
        <div className="[&_button]:w-full [&_button]:justify-start">{signOut}</div>
      </PopoverContent>
    </Popover>
  );
}
