import type { LucideIcon } from "lucide-react";
import { Button } from "@/ui/primitives/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/ui/primitives/tooltip";

export function WorkspaceAppButton({
  label,
  icon: Icon,
  active,
  unread = false,
  onClick,
}: {
  label: string;
  icon: LucideIcon;
  active: boolean;
  unread?: boolean;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="rail"
          size="icon-lg"
          className="relative"
          aria-label={unread ? `${label}, unread notifications` : label}
          aria-current={active ? "page" : undefined}
          onClick={onClick}
        >
          <Icon className="size-5" />
          {unread && (
            <span
              aria-hidden="true"
              className="absolute right-2 top-2 size-2 rounded-full bg-destructive ring-2 ring-rail"
            />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}
