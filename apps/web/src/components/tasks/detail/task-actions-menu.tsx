import type { Ref } from "react";

import { MoreActionsTrigger } from "@/components/layout/more-actions-trigger";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { FolderInput, Trash2 } from "lucide-react";

export function TaskActionsMenu({
  triggerRef,
  onMove,
  onDelete,
}: {
  triggerRef: Ref<HTMLButtonElement>;
  onMove: () => void;
  onDelete: () => void;
}) {
  return (
    <DropdownMenu>
      <MoreActionsTrigger triggerRef={triggerRef} />
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={onMove}>
          <FolderInput aria-hidden="true" />
          Move task
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={onDelete}>
          <Trash2 aria-hidden="true" />
          Delete task
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
