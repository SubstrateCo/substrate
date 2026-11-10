import { Button } from "@/components/ui/button";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { LucideIcon } from "lucide-react";

export function WorkspaceAppButton({
  label,
  icon: Icon,
  active,
  shortcut,
  unread = false,
  unreadLabel = "unread notifications",
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
              className="absolute top-2 right-2 size-2 rounded-full bg-destructive ring-2 ring-rail"
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
