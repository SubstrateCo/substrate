import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Crown, Ellipsis, Globe, LogOut, Trash2 } from "lucide-react";

export function ConversationActionsMenu({
  leaveLabel = "Leave conversation",
  deleteLabel,
  onLeave,
  onTransfer,
  onDelete,
  onSharing,
}: {
  /** "Leave channel" or "Leave group". */
  leaveLabel?: string;
  /** "Delete channel" or "Delete group": the item names what it destroys. */
  deleteLabel: string;
  onLeave?: () => void;
  onTransfer?: () => void;
  onDelete?: () => void;
  onSharing?: () => void;
}) {
  const hasActions = [onLeave, onTransfer, onDelete, onSharing].some(Boolean);
  if (!hasActions) return null;
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Conversation actions">
              <Ellipsis />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>Conversation actions</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end">
        {onSharing && (
          <DropdownMenuItem onSelect={onSharing}>
            <Globe />
            External collaboration
          </DropdownMenuItem>
        )}
        {onLeave && (
          <DropdownMenuItem onSelect={onLeave}>
            <LogOut />
            {leaveLabel}
          </DropdownMenuItem>
        )}
        {onTransfer && (
          <DropdownMenuItem onSelect={onTransfer}>
            <Crown />
            Change owner
          </DropdownMenuItem>
        )}
        {onDelete && (
          <>
            {(onSharing || onLeave || onTransfer) && <DropdownMenuSeparator />}
            <DropdownMenuItem variant="destructive" onSelect={onDelete}>
              <Trash2 />
              {deleteLabel}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
