import { Button } from "../../ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../ui/tooltip";
import { Link2 } from "lucide-react";

export function MessageWorkActions({ onLink }: { onLink: () => void }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          size="icon-xs"
          variant="ghost"
          aria-label="Link existing work"
          onClick={onLink}
        >
          <Link2 aria-hidden="true" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>Link existing work</TooltipContent>
    </Tooltip>
  );
}
