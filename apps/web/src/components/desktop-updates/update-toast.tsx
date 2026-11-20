import type { UpdateNoticeContent } from "./update-notice-content";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { CircleAlert, X } from "lucide-react";

/**
 * The update notice inside the shared toast frame. The text gets the full width and the action sits
 * under it as a real button, so a long label never squeezes the description into a narrow column.
 */
export function UpdateToast({
  content,
  onAction,
  onClose,
}: {
  content: UpdateNoticeContent;
  onAction: () => void;
  onClose: () => void;
}) {
  return (
    <div className="flex w-full min-w-0 items-start gap-2">
      {content.tone === "error" && (
        <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-destructive" />
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="text-sm leading-5 font-medium">{content.title}</p>
        <p className="text-sm leading-5 text-muted-foreground">{content.description}</p>
        {content.action && (
          <div className="mt-3 flex gap-2">
            <Button
              type="button"
              size="sm"
              variant={content.tone === "error" ? "outline" : "default"}
              onClick={onAction}
            >
              {content.action.label}
            </Button>
          </div>
        )}
      </div>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="absolute top-2 right-2"
            aria-label="Close"
            onClick={onClose}
          >
            <X aria-hidden="true" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Close</TooltipContent>
      </Tooltip>
    </div>
  );
}
