import type { ReactNode } from "react";

import { RowAction, RowActions } from "@/components/layout/row-actions";
import { cn } from "cn";
import { Pencil, Settings, Trash2 } from "lucide-react";

export function CatalogRow({
  name,
  detail,
  picture,
  mono = false,
  onSettings,
  onEdit,
  onDelete,
  disabled,
}: {
  name: string;
  /** Show the name as a file name, in monospace. */
  mono?: boolean;
  detail: string;
  picture?: ReactNode;
  onSettings?: () => void;
  onEdit: () => void;
  onDelete: () => void;
  disabled: boolean;
}) {
  return (
    <li className="group/row flex items-center justify-between gap-3 px-4 py-3">
      <div className="flex min-w-0 items-center gap-3">
        {picture}
        <div className="grid min-w-0 gap-1">
          <p className={cn("text-sm font-medium wrap-anywhere", mono && "font-mono")}>{name}</p>
          <p className="line-clamp-2 text-xs wrap-anywhere text-muted-foreground">{detail}</p>
        </div>
      </div>
      <RowActions label={`Actions for ${name}`}>
        {onSettings && (
          <RowAction label={`Run settings for ${name}`} disabled={disabled} onClick={onSettings}>
            <Settings />
          </RowAction>
        )}
        <RowAction label={`Edit ${name}`} disabled={disabled} onClick={onEdit}>
          <Pencil />
        </RowAction>
        <RowAction label={`Delete ${name}`} destructive disabled={disabled} onClick={onDelete}>
          <Trash2 />
        </RowAction>
      </RowActions>
    </li>
  );
}
