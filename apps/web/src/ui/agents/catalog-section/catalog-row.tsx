import type { ReactNode } from "react";

import { Button } from "@/ui/primitives/button";

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
          <p className="font-medium wrap-break-word">{name}</p>
          <p className="text-sm wrap-break-word text-muted-foreground">{detail}</p>
        </div>
      </div>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          aria-label={`Edit ${name}`}
          onClick={onEdit}
        >
          Edit
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={disabled}
          aria-label={`Delete ${name}`}
          onClick={onDelete}
        >
          Delete
        </Button>
      </div>
    </li>
  );
}
