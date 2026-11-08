import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Bot, Crown, Ellipsis, LogOut, Trash2 } from "lucide-react";

export function ConversationActionsMenu({
  onAgents,
  onLeave,
  onTransfer,
  onDelete,
}: {
  onAgents?: () => void;
  onLeave?: () => void;
  onTransfer?: () => void;
  onDelete?: () => void;
}) {
  const hasActions = [onAgents, onLeave, onTransfer, onDelete].some(Boolean);
  if (!hasActions) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon-sm" aria-label="Conversation actions">
          <Ellipsis />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {onAgents && (
          <DropdownMenuItem onSelect={onAgents}>
            <Bot />
            Your agents
          </DropdownMenuItem>
        )}
        {onLeave && (
          <DropdownMenuItem onSelect={onLeave}>
            <LogOut />
            Leave
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
            {(onAgents || onLeave || onTransfer) && <DropdownMenuSeparator />}
            <DropdownMenuItem variant="destructive" onSelect={onDelete}>
              <Trash2 />
              Delete
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
