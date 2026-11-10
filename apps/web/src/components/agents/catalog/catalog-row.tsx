import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Pencil, Settings, Trash2 } from "lucide-react";

export function CatalogRow({
  name,
  detail,
  picture,
  onSettings,
  onEdit,
  onDelete,
  disabled,
}: {
  name: string;
  detail: string;
  picture?: ReactNode;
  onSettings?: () => void;
  onEdit: () => void;
  onDelete: () => void;
  disabled: boolean;
}) {
  return (
    <li className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="flex min-w-0 items-center gap-3">
        {picture}
        <div className="grid min-w-0 gap-1">
          <p className="text-sm font-medium wrap-anywhere">{name}</p>
          <p className="line-clamp-2 text-xs wrap-anywhere text-muted-foreground">{detail}</p>
        </div>
      </div>
      <div
        role="group"
        aria-label={`Actions for ${name}`}
        className="flex shrink-0 items-center gap-0.5"
      >
        {onSettings && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                disabled={disabled}
                aria-label={`Run settings for ${name}`}
                onClick={onSettings}
              >
                <Settings />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Run settings for {name}</TooltipContent>
          </Tooltip>
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={disabled}
              aria-label={`Edit ${name}`}
              onClick={onEdit}
            >
              <Pencil />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Edit {name}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="destructive-ghost"
              size="icon-sm"
              disabled={disabled}
              aria-label={`Delete ${name}`}
              onClick={onDelete}
            >
              <Trash2 />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Delete {name}</TooltipContent>
        </Tooltip>
      </div>
    </li>
  );
}
