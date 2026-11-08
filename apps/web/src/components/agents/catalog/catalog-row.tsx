import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { PencilIcon, Trash2Icon } from "lucide-react";

export function CatalogRow({
  name,
  detail,
  picture,
  onEdit,
  onDelete,
  disabled,
}: {
  name: string;
  detail: string;
  picture?: ReactNode;
  onEdit: () => void;
  onDelete: () => void;
  disabled: boolean;
}) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
      <div className="flex min-w-0 items-center gap-3">
        {picture}
        <div className="min-w-0">
          <p className="font-medium wrap-anywhere">{name}</p>
          <p className="text-sm wrap-anywhere text-muted-foreground">{detail}</p>
        </div>
      </div>
      <ButtonGroup aria-label={`Actions for ${name}`}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon-sm"
              disabled={disabled}
              aria-label={`Edit ${name}`}
              onClick={onEdit}
            >
              <PencilIcon />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Edit {name}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="destructive"
              size="icon-sm"
              disabled={disabled}
              aria-label={`Delete ${name}`}
              onClick={onDelete}
            >
              <Trash2Icon />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Delete {name}</TooltipContent>
        </Tooltip>
      </ButtonGroup>
    </li>
  );
}
