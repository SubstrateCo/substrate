import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Hash, LockKeyhole, UserPlus } from "lucide-react";

export function ConversationHeader({
  title,
  channelIcon,
  addingMembers,
  onToggleMembers,
}: {
  title: string;
  channelIcon?: "private" | "public";
  addingMembers: boolean;
  onToggleMembers?: () => void;
}) {
  return (
    <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b bg-card/60 px-4">
      <h1 className="flex min-w-0 items-center gap-2 font-semibold">
        {channelIcon === "private" && <LockKeyhole className="size-4 shrink-0" />}
        {channelIcon === "public" && <Hash className="size-5 shrink-0" />}
        <span className="truncate">{title}</span>
      </h1>
      {onToggleMembers && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon-sm"
              onClick={onToggleMembers}
              aria-label="Add people"
              aria-expanded={addingMembers}
            >
              <UserPlus />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Add people</TooltipContent>
        </Tooltip>
      )}
    </header>
  );
}
