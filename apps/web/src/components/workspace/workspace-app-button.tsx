import { Button } from "@/components/ui/button";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "cn";
import type { LucideIcon } from "lucide-react";

export function WorkspaceAppButton({
  label,
  icon: Icon,
  active,
  shortcut,
  unread = false,
  unreadLabel = "unread notifications",
  dotTone = "primary",
  onClick,
}: {
  label: string;
  icon: LucideIcon;
  active: boolean;
  /** The key pressed after G to open this app. */
  shortcut?: string;
  unread?: boolean;
  /** What the dot means, read after the label. */
  unreadLabel?: string;
  /** Primary for unread notifications; warning for work that needs the person. Red is for errors. */
  dotTone?: "primary" | "warning";
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="rail"
          size="icon-lg"
          className="relative"
          aria-label={unread ? `${label}, ${unreadLabel}` : label}
          aria-keyshortcuts={shortcut ? `G ${shortcut}` : undefined}
          aria-current={active ? "page" : undefined}
          onClick={onClick}
        >
          <Icon className="size-5" />
          {unread && (
            <span
              aria-hidden="true"
              className={cn(
                "absolute top-2 right-2 size-2 rounded-full ring-2 ring-rail",
                dotTone === "warning" ? "bg-warning" : "bg-primary",
              )}
            />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="right">
        {label}
        {shortcut && (
          <KbdGroup aria-hidden="true">
            <Kbd>G</Kbd>
            <Kbd>{shortcut}</Kbd>
          </KbdGroup>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
