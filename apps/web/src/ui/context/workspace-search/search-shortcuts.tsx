import { Kbd, KbdGroup } from "@/ui/primitives/kbd";
import { ArrowDown, ArrowUp, CornerDownLeft } from "lucide-react";

export function SearchShortcuts() {
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-t px-3 py-2 text-xs text-muted-foreground">
      <span className="flex items-center gap-1.5">
        <KbdGroup>
          <Kbd>
            <ArrowUp aria-label="Up" />
          </Kbd>
          <Kbd>
            <ArrowDown aria-label="Down" />
          </Kbd>
        </KbdGroup>{" "}
        to navigate
      </span>
      <span className="flex items-center gap-1.5">
        <Kbd>
          <CornerDownLeft aria-label="Enter" />
        </Kbd>{" "}
        to open
      </span>
      <span className="ml-auto flex items-center gap-1.5">
        <Kbd>Esc</Kbd> to close
      </span>
    </div>
  );
}
