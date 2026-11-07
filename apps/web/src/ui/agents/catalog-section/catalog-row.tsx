import type { ReactNode } from "react";

import { Button } from "@/ui/primitives/button";
import { ButtonGroup } from "@/ui/primitives/button-group";
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
        <Button
          variant="outline"
          size="icon-sm"
          disabled={disabled}
          aria-label={`Edit ${name}`}
          title={`Edit ${name}`}
          onClick={onEdit}
        >
          <PencilIcon />
        </Button>
        <Button
          variant="destructive"
          size="icon-sm"
          disabled={disabled}
          aria-label={`Delete ${name}`}
          title={`Delete ${name}`}
          onClick={onDelete}
        >
          <Trash2Icon />
        </Button>
      </ButtonGroup>
    </li>
  );
}
